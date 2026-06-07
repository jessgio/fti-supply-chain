-- Growth RPC: aggregate from sales_records with precomputed bundle shares (no per-sale windows)

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
  filtered_sales as (
    select sr.*
    from public.sales_records sr
    where (p_from is null or sr.sale_date >= p_from)
      and (p_to is null or sr.sale_date <= p_to)
  ),
  direct_sales as (
    select
      sr.sale_date,
      sr.channel_id,
      s.franchise_id,
      sr.qty_sold,
      sr.net_sales
    from filtered_sales sr
    join public.skus s on s.id = sr.sku_id
    where s.is_bundle = false
      and s.franchise_id is not null
  ),
  bundle_sales as (
    select
      sr.sale_date,
      sr.channel_id,
      bcs.franchise_id,
      sr.qty_sold * bcs.qty_per_bundle as qty_sold,
      sr.net_sales * bcs.net_share as net_sales
    from filtered_sales sr
    join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
    join bundle_component_shares bcs on bcs.bundle_sku_id = bs.id
  ),
  expanded as (
    select * from direct_sales
    union all
    select * from bundle_sales
  )
  select
    case p_grain
      when 'day' then e.sale_date
      when 'week' then date_trunc('week', e.sale_date)::date
      when 'month' then date_trunc('month', e.sale_date)::date
      when 'year' then date_trunc('year', e.sale_date)::date
      else date_trunc('month', e.sale_date)::date
    end as sale_date,
    e.channel_id,
    sc.name as channel_name,
    e.franchise_id,
    pf.name as franchise_name,
    sum(e.qty_sold) as total_qty,
    sum(e.net_sales) as total_net_sales
  from expanded e
  join public.sales_channels sc on sc.id = e.channel_id
  join public.product_franchises pf on pf.id = e.franchise_id
  where (p_channel_id is null or e.channel_id = p_channel_id)
    and (p_franchise_id is null or e.franchise_id = p_franchise_id)
  group by 1, 2, 3, 4, 5
  order by 1;
$$;
