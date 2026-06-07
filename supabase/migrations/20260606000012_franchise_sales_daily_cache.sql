-- Pre-aggregated daily franchise sales for fast growth analytics

create table public.franchise_sales_daily_agg (
  sale_date date not null,
  channel_id uuid not null references public.sales_channels (id) on delete cascade,
  franchise_id uuid not null references public.product_franchises (id) on delete cascade,
  total_qty numeric not null default 0,
  total_net_sales numeric not null default 0,
  primary key (sale_date, channel_id, franchise_id)
);

create index franchise_sales_daily_agg_date_idx
  on public.franchise_sales_daily_agg (sale_date);

alter table public.franchise_sales_daily_agg enable row level security;

create policy "authenticated read franchise_sales_daily_agg"
  on public.franchise_sales_daily_agg
  for select to authenticated using (true);

create or replace function public.refresh_franchise_sales_daily_agg()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate public.franchise_sales_daily_agg;

  insert into public.franchise_sales_daily_agg (
    sale_date,
    channel_id,
    franchise_id,
    total_qty,
    total_net_sales
  )
  with bundle_component_shares as (
    select
      bc.bundle_sku_id,
      cs.franchise_id,
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
    where cs.franchise_id is not null
  ),
  direct_daily as (
    select
      sr.sale_date,
      sr.channel_id,
      s.franchise_id,
      sum(sr.qty_sold) as qty_sold,
      sum(sr.net_sales) as net_sales
    from public.sales_records sr
    join public.skus s on s.id = sr.sku_id
    where s.is_bundle = false
      and s.franchise_id is not null
    group by sr.sale_date, sr.channel_id, s.franchise_id
  ),
  bundle_daily as (
    select
      sr.sale_date,
      sr.channel_id,
      sr.sku_id as bundle_sku_id,
      sum(sr.qty_sold) as bundle_qty,
      sum(sr.net_sales) as bundle_net_sales
    from public.sales_records sr
    join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
    group by sr.sale_date, sr.channel_id, sr.sku_id
  ),
  bundle_expanded as (
    select
      bd.sale_date,
      bd.channel_id,
      bcs.franchise_id,
      bd.bundle_qty * bcs.qty_per_bundle as qty_sold,
      bd.bundle_net_sales * bcs.net_share as net_sales
    from bundle_daily bd
    join bundle_component_shares bcs on bcs.bundle_sku_id = bd.bundle_sku_id
  ),
  daily_totals as (
    select sale_date, channel_id, franchise_id, qty_sold, net_sales
    from direct_daily
    union all
    select sale_date, channel_id, franchise_id, qty_sold, net_sales
    from bundle_expanded
  )
  select
    sale_date,
    channel_id,
    franchise_id,
    sum(qty_sold) as total_qty,
    sum(net_sales) as total_net_sales
  from daily_totals
  group by sale_date, channel_id, franchise_id;
end;
$$;

create or replace function public.get_franchise_period_totals(
  p_grain text default 'month',
  p_from date default null,
  p_to date default null,
  p_channel_id uuid default null,
  p_franchise_id uuid default null
)
returns table (
  sale_date date,
  channel_id uuid,
  channel_name text,
  franchise_id uuid,
  franchise_name text,
  total_qty numeric,
  total_net_sales numeric
)
language sql
stable
as $$
  select
    case p_grain
      when 'day' then f.sale_date
      when 'week' then date_trunc('week', f.sale_date)::date
      when 'month' then date_trunc('month', f.sale_date)::date
      when 'year' then date_trunc('year', f.sale_date)::date
      else date_trunc('month', f.sale_date)::date
    end as sale_date,
    f.channel_id,
    sc.name as channel_name,
    f.franchise_id,
    pf.name as franchise_name,
    sum(f.total_qty) as total_qty,
    sum(f.total_net_sales) as total_net_sales
  from public.franchise_sales_daily_agg f
  join public.sales_channels sc on sc.id = f.channel_id
  join public.product_franchises pf on pf.id = f.franchise_id
  where (p_from is null or f.sale_date >= p_from)
    and (p_to is null or f.sale_date <= p_to)
    and (p_channel_id is null or f.channel_id = p_channel_id)
    and (p_franchise_id is null or f.franchise_id = p_franchise_id)
  group by 1, 2, 3, 4, 5
  order by 1;
$$;

select public.refresh_franchise_sales_daily_agg();
