-- SKU-first sales aggregation: per-SKU singles + bundle component qty, then franchise rollup

create table if not exists public.sku_sales_daily_agg (
  sale_date date not null,
  channel_id uuid not null references public.sales_channels (id) on delete cascade,
  sku_code text not null,
  total_qty numeric not null default 0,
  total_net_sales numeric not null default 0,
  primary key (sale_date, channel_id, sku_code)
);

create index if not exists sku_sales_daily_agg_date_idx
  on public.sku_sales_daily_agg (sale_date);

alter table public.sku_sales_daily_agg enable row level security;

drop policy if exists "authenticated read sku_sales_daily_agg"
  on public.sku_sales_daily_agg;

create policy "authenticated read sku_sales_daily_agg"
  on public.sku_sales_daily_agg
  for select to authenticated using (true);

create or replace function public.clear_sales_records()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate public.sales_records;
end;
$$;

create or replace function public.refresh_franchise_sales_daily_agg()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate public.sku_sales_daily_agg;
  truncate public.franchise_sales_daily_agg;

  insert into public.sku_sales_daily_agg (
    sale_date,
    channel_id,
    sku_code,
    total_qty,
    total_net_sales
  )
  with bundle_component_shares as (
    select
      bc.bundle_sku_id,
      cs.sku_code,
      bc.qty_per_bundle,
      case
        when sum(
          case when coalesce(cs.retail_price, 0) > 0 then 1 else 0 end
        ) over (partition by bc.bundle_sku_id) = count(*) over (partition by bc.bundle_sku_id)
          and sum(coalesce(cs.retail_price, 0) * bc.qty_per_bundle) over (partition by bc.bundle_sku_id) > 0
        then (coalesce(cs.retail_price, 0) * bc.qty_per_bundle) / nullif(
          sum(coalesce(cs.retail_price, 0) * bc.qty_per_bundle) over (partition by bc.bundle_sku_id),
          0
        )
        else bc.qty_per_bundle / nullif(
          sum(bc.qty_per_bundle) over (partition by bc.bundle_sku_id),
          0
        )
      end as net_share
    from public.bundle_components bc
    join public.skus cs on cs.id = bc.component_sku_id
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
      bcs.sku_code,
      sr.sale_date,
      sr.channel_id,
      sum(sr.qty_sold * bcs.qty_per_bundle) as qty_sold,
      sum(sr.net_sales * bcs.net_share) as net_sales
    from public.sales_records sr
    join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
    join bundle_component_shares bcs on bcs.bundle_sku_id = bs.id
    group by bcs.sku_code, sr.sale_date, sr.channel_id
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
    s.franchise_id,
    sum(sd.total_qty) as total_qty,
    sum(sd.total_net_sales) as total_net_sales
  from public.sku_sales_daily_agg sd
  join public.skus s on s.sku_code = sd.sku_code
  where s.franchise_id is not null
  group by sd.sale_date, sd.channel_id, s.franchise_id;
end;
$$;
