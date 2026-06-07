-- FTI Supply Chain: core schema
-- Product franchises, SKUs, bundle mappings, sales, stock, and analytics views

create extension if not exists "pgcrypto";

-- Reference data
create table public.product_franchises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.skus (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null unique,
  name text,
  franchise_id uuid references public.product_franchises (id) on delete set null,
  is_bundle boolean not null default false,
  created_at timestamptz not null default now()
);

create index skus_franchise_id_idx on public.skus (franchise_id);

-- Bundle SKU -> component SKU breakdown
create table public.bundle_components (
  id uuid primary key default gen_random_uuid(),
  bundle_sku_id uuid not null references public.skus (id) on delete cascade,
  component_sku_id uuid not null references public.skus (id) on delete cascade,
  qty_per_bundle numeric(12, 4) not null check (qty_per_bundle > 0),
  created_at timestamptz not null default now(),
  unique (bundle_sku_id, component_sku_id),
  check (bundle_sku_id <> component_sku_id)
);

create index bundle_components_bundle_idx on public.bundle_components (bundle_sku_id);
create index bundle_components_component_idx on public.bundle_components (component_sku_id);

-- Upload audit trail
create type public.upload_type as enum ('sales', 'stock', 'mappings');

create table public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  upload_type public.upload_type not null,
  filename text not null,
  row_count integer not null default 0,
  uploaded_at timestamptz not null default now()
);

-- Raw sales transactions
create table public.sales_records (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  channel_id uuid not null references public.sales_channels (id) on delete restrict,
  sku_id uuid not null references public.skus (id) on delete restrict,
  qty_sold numeric(14, 4) not null,
  net_sales numeric(14, 2) not null,
  upload_batch_id uuid references public.upload_batches (id) on delete set null,
  created_at timestamptz not null default now()
);

create index sales_records_sale_date_idx on public.sales_records (sale_date);
create index sales_records_channel_date_idx on public.sales_records (channel_id, sale_date);
create index sales_records_sku_date_idx on public.sales_records (sku_id, sale_date);

-- Stock snapshots
create table public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id) on delete restrict,
  location text not null default 'default',
  qty_on_hand numeric(14, 4) not null check (qty_on_hand >= 0),
  as_of_date date not null,
  upload_batch_id uuid references public.upload_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (sku_id, location, as_of_date)
);

create index stock_levels_as_of_date_idx on public.stock_levels (as_of_date);
create index stock_levels_sku_idx on public.stock_levels (sku_id);

-- Expand bundle sales into component-level franchise contributions
create or replace view public.franchise_sales_expanded
with (security_invoker = true)
as
with direct_sales as (
  select
    sr.id as sales_record_id,
    sr.sale_date,
    sr.channel_id,
    sr.sku_id as source_sku_id,
    sr.qty_sold,
    sr.net_sales,
    s.franchise_id,
    s.sku_code,
    false as from_bundle
  from public.sales_records sr
  join public.skus s on s.id = sr.sku_id
  where s.is_bundle = false
),
bundle_sales as (
  select
    sr.id as sales_record_id,
    sr.sale_date,
    sr.channel_id,
    sr.sku_id as source_sku_id,
    sr.qty_sold * bc.qty_per_bundle as qty_sold,
    sr.net_sales * (
      bc.qty_per_bundle / nullif(
        sum(bc.qty_per_bundle) over (partition by sr.id),
        0
      )
    ) as net_sales,
    cs.franchise_id,
    cs.sku_code,
    true as from_bundle
  from public.sales_records sr
  join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
  join public.bundle_components bc on bc.bundle_sku_id = bs.id
  join public.skus cs on cs.id = bc.component_sku_id
)
select * from direct_sales
union all
select * from bundle_sales;

-- Franchise aggregates by period (used by API with date filters)
create or replace view public.franchise_daily_totals
with (security_invoker = true)
as
select
  fse.sale_date,
  fse.channel_id,
  sc.name as channel_name,
  fse.franchise_id,
  pf.name as franchise_name,
  sum(fse.qty_sold) as total_qty,
  sum(fse.net_sales) as total_net_sales
from public.franchise_sales_expanded fse
join public.sales_channels sc on sc.id = fse.channel_id
left join public.product_franchises pf on pf.id = fse.franchise_id
where fse.franchise_id is not null
group by
  fse.sale_date,
  fse.channel_id,
  sc.name,
  fse.franchise_id,
  pf.name;

-- RLS: enable on all tables (authenticated team access)
alter table public.product_franchises enable row level security;
alter table public.sales_channels enable row level security;
alter table public.skus enable row level security;
alter table public.bundle_components enable row level security;
alter table public.upload_batches enable row level security;
alter table public.sales_records enable row level security;
alter table public.stock_levels enable row level security;

create policy "authenticated read franchises" on public.product_franchises
  for select to authenticated using (true);
create policy "authenticated write franchises" on public.product_franchises
  for all to authenticated using (true) with check (true);

create policy "authenticated read channels" on public.sales_channels
  for select to authenticated using (true);
create policy "authenticated write channels" on public.sales_channels
  for all to authenticated using (true) with check (true);

create policy "authenticated read skus" on public.skus
  for select to authenticated using (true);
create policy "authenticated write skus" on public.skus
  for all to authenticated using (true) with check (true);

create policy "authenticated read bundle_components" on public.bundle_components
  for select to authenticated using (true);
create policy "authenticated write bundle_components" on public.bundle_components
  for all to authenticated using (true) with check (true);

create policy "authenticated read upload_batches" on public.upload_batches
  for select to authenticated using (true);
create policy "authenticated write upload_batches" on public.upload_batches
  for all to authenticated using (true) with check (true);

create policy "authenticated read sales_records" on public.sales_records
  for select to authenticated using (true);
create policy "authenticated write sales_records" on public.sales_records
  for all to authenticated using (true) with check (true);

create policy "authenticated read stock_levels" on public.stock_levels
  for select to authenticated using (true);
create policy "authenticated write stock_levels" on public.stock_levels
  for all to authenticated using (true) with check (true);
