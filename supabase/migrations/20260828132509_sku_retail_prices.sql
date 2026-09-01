-- Month-effective RSP history. skus.retail_price remains the list price as of today.

create table if not exists public.sku_retail_prices (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id) on delete cascade,
  effective_from date not null,
  retail_price numeric(14, 2) not null check (retail_price > 0),
  created_at timestamptz not null default now(),
  constraint sku_retail_prices_sku_from_unique unique (sku_id, effective_from)
);

comment on table public.sku_retail_prices is
  'SKU list-price history. Each row is the RSP in force from effective_from (first of month) until the next row.';

comment on column public.sku_retail_prices.effective_from is
  'First day of the month this RSP takes effect.';

create index if not exists sku_retail_prices_sku_from_idx
  on public.sku_retail_prices (sku_id, effective_from desc);

alter table public.sku_retail_prices enable row level security;

drop policy if exists "authenticated read sku_retail_prices"
  on public.sku_retail_prices;
create policy "authenticated read sku_retail_prices"
  on public.sku_retail_prices for select
  to authenticated
  using (true);

drop policy if exists "commercial write sku_retail_prices"
  on public.sku_retail_prices;
create policy "commercial write sku_retail_prices"
  on public.sku_retail_prices for all
  to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'))
  with check (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'));

create or replace function public.sku_retail_price_as_of(p_sku_id uuid, p_on date)
returns numeric
language sql
stable
parallel safe
as $$
  select p.retail_price
  from public.sku_retail_prices p
  where p.sku_id = p_sku_id
    and p.effective_from <= p_on
  order by p.effective_from desc
  limit 1;
$$;

comment on function public.sku_retail_price_as_of(uuid, date) is
  'RSP in force on p_on from sku_retail_prices. Null when no history row applies.';

grant execute on function public.sku_retail_price_as_of(uuid, date) to authenticated;

create or replace function public.sync_sku_current_retail_price()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sku_id uuid := coalesce(new.sku_id, old.sku_id);
begin
  update public.skus
  set retail_price = public.sku_retail_price_as_of(v_sku_id, current_date)
  where id = v_sku_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sku_retail_prices_sync_current on public.sku_retail_prices;
create trigger sku_retail_prices_sync_current
  after insert or update or delete on public.sku_retail_prices
  for each row
  execute function public.sync_sku_current_retail_price();

insert into public.sku_retail_prices (sku_id, effective_from, retail_price)
select s.id, date '2000-01-01', s.retail_price
from public.skus s
where s.retail_price is not null
  and s.retail_price > 0
on conflict (sku_id, effective_from) do nothing;

comment on column public.skus.retail_price is
  'Retail selling price (Harga / RSP) in force as of today. History lives in sku_retail_prices.';

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
      case
        when sum(
          case
            when coalesce(
              public.sku_retail_price_as_of(cs.id, sr.sale_date),
              cs.retail_price,
              0
            ) > 0 then 1
            else 0
          end
        ) over (partition by sr.id) = count(*) over (partition by sr.id)
          and sum(
            coalesce(
              public.sku_retail_price_as_of(cs.id, sr.sale_date),
              cs.retail_price,
              0
            ) * bc.qty_per_bundle
          ) over (partition by sr.id) > 0
        then (
          coalesce(
            public.sku_retail_price_as_of(cs.id, sr.sale_date),
            cs.retail_price,
            0
          ) * bc.qty_per_bundle
        ) / nullif(
          sum(
            coalesce(
              public.sku_retail_price_as_of(cs.id, sr.sale_date),
              cs.retail_price,
              0
            ) * bc.qty_per_bundle
          ) over (partition by sr.id),
          0
        )
        else bc.qty_per_bundle / nullif(
          sum(bc.qty_per_bundle) over (partition by sr.id),
          0
        )
      end
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

create or replace function public.refresh_franchise_sales_daily_agg()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.backfill_sku_franchise_ids();

  truncate public.sku_sales_daily_agg;
  truncate public.franchise_sales_daily_agg;

  insert into public.sku_sales_daily_agg (
    sale_date,
    channel_id,
    sku_code,
    total_qty,
    total_net_sales
  )
  with bundle_lines as (
    select
      sr.id as sales_record_id,
      sr.sale_date,
      sr.channel_id,
      sr.qty_sold,
      sr.net_sales,
      cs.sku_code,
      bc.qty_per_bundle,
      coalesce(
        public.sku_retail_price_as_of(cs.id, sr.sale_date),
        cs.retail_price,
        0
      ) as component_rsp
    from public.sales_records sr
    join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
    join public.bundle_components bc on bc.bundle_sku_id = bs.id
    join public.skus cs on cs.id = bc.component_sku_id
  ),
  bundle_shares as (
    select
      sales_record_id,
      sale_date,
      channel_id,
      qty_sold,
      net_sales,
      sku_code,
      qty_per_bundle,
      case
        when sum(
          case when component_rsp > 0 then 1 else 0 end
        ) over (partition by sales_record_id) = count(*) over (partition by sales_record_id)
          and sum(component_rsp * qty_per_bundle) over (partition by sales_record_id) > 0
        then (component_rsp * qty_per_bundle) / nullif(
          sum(component_rsp * qty_per_bundle) over (partition by sales_record_id),
          0
        )
        else qty_per_bundle / nullif(
          sum(qty_per_bundle) over (partition by sales_record_id),
          0
        )
      end as net_share
    from bundle_lines
  ),
  sku_direct as (
    select
      s.sku_code,
      sr.sale_date,
      sr.channel_id,
      sum(sr.qty_sold) as qty_sold,
      sum(sr.net_sales) as net_sales
    from public.sales_records sr
    join public.skus s on s.id = sr.sku_id
    where s.is_bundle = false
    group by s.sku_code, sr.sale_date, sr.channel_id
  ),
  sku_bundle as (
    select
      sku_code,
      sale_date,
      channel_id,
      sum(qty_sold * qty_per_bundle) as qty_sold,
      sum(net_sales * net_share) as net_sales
    from bundle_shares
    group by sku_code, sale_date, channel_id
  ),
  sku_daily as (
    select sku_code, sale_date, channel_id, qty_sold, net_sales
    from sku_direct
    union all
    select sku_code, sale_date, channel_id, qty_sold, net_sales
    from sku_bundle
  )
  select
    sale_date,
    channel_id,
    sku_code,
    sum(qty_sold) as total_qty,
    sum(net_sales) as total_net_sales
  from sku_daily
  group by sale_date, channel_id, sku_code;

  insert into public.franchise_sales_daily_agg (
    sale_date,
    channel_id,
    franchise_id,
    total_qty,
    total_net_sales
  )
  select
    sd.sale_date,
    sd.channel_id,
    public.resolve_sku_franchise_id(sd.sku_code) as franchise_id,
    sum(sd.total_qty) as total_qty,
    sum(sd.total_net_sales) as total_net_sales
  from public.sku_sales_daily_agg sd
  where public.resolve_sku_franchise_id(sd.sku_code) is not null
  group by sd.sale_date, sd.channel_id, 3;
end;
$$;
