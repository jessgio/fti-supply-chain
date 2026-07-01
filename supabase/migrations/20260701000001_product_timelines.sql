-- FTI Supply Chain: saved product production timelines (Timeline Adjustment module)

create table public.product_timelines (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  anchor text not null check (anchor in ('start', 'warehouse_delivery')),
  anchor_date date not null,
  primary_packaging_days integer not null default 65 check (primary_packaging_days > 0),
  secondary_packaging_days integer not null default 30 check (secondary_packaging_days > 0),
  extract_days integer not null default 60 check (extract_days > 0),
  send_to_manufacturer_days integer not null default 3 check (send_to_manufacturer_days > 0),
  manufacturer_filling_days integer not null default 30 check (manufacturer_filling_days > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_timelines_product_name_key unique (product_name)
);

create index product_timelines_product_name_idx
  on public.product_timelines (product_name);

alter table public.product_timelines enable row level security;

create policy "authenticated read product_timelines" on public.product_timelines
  for select to authenticated using (true);

create policy "writer write product_timelines" on public.product_timelines
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
