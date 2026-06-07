-- Growth RPC: pre-aggregate to daily franchise totals before period rollup

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
      and (p_from is null or sr.sale_date >= p_from)
      and (p_to is null or sr.sale_date <= p_to)
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
    where (p_from is null or sr.sale_date >= p_from)
      and (p_to is null or sr.sale_date <= p_to)
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
    case p_grain
      when 'day' then dt.sale_date
      when 'week' then date_trunc('week', dt.sale_date)::date
      when 'month' then date_trunc('month', dt.sale_date)::date
      when 'year' then date_trunc('year', dt.sale_date)::date
      else date_trunc('month', dt.sale_date)::date
    end as sale_date,
    dt.channel_id,
    sc.name as channel_name,
    dt.franchise_id,
    pf.name as franchise_name,
    sum(dt.qty_sold) as total_qty,
    sum(dt.net_sales) as total_net_sales
  from daily_totals dt
  join public.sales_channels sc on sc.id = dt.channel_id
  join public.product_franchises pf on pf.id = dt.franchise_id
  where (p_channel_id is null or dt.channel_id = p_channel_id)
    and (p_franchise_id is null or dt.franchise_id = p_franchise_id)
  group by 1, 2, 3, 4, 5
  order by 1;
$$;
