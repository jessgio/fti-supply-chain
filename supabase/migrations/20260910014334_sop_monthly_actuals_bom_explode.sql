-- S&OP monthly actuals must include units sold inside bundles.
-- Direct sales stay on the sold SKU (bundle rows keep set units).
-- Nested BOMs explode to leaf SKUs; net sales follow RSP × qty share.

create or replace function public.get_sop_monthly_actuals(
  p_start date,
  p_end date
)
returns table (
  sku_id uuid,
  channel_id uuid,
  sale_year integer,
  sale_month integer,
  qty numeric,
  net_sales numeric
)
language sql
stable
set search_path = public
as $$
  with recursive bundle_tree as (
    select
      bc.bundle_sku_id as root_bundle_id,
      bc.component_sku_id,
      bc.qty_per_bundle::numeric as qty_per_root,
      array[bc.bundle_sku_id, bc.component_sku_id] as path
    from public.bundle_components bc
    where bc.qty_per_bundle > 0

    union all

    select
      bt.root_bundle_id,
      bc.component_sku_id,
      (bt.qty_per_root * bc.qty_per_bundle)::numeric,
      bt.path || bc.component_sku_id
    from bundle_tree bt
    join public.bundle_components bc
      on bc.bundle_sku_id = bt.component_sku_id
     and bc.qty_per_bundle > 0
    where not (bc.component_sku_id = any (bt.path))
  ),
  leaves as (
    select
      bt.root_bundle_id,
      bt.component_sku_id,
      sum(bt.qty_per_root) as qty_per_bundle
    from bundle_tree bt
    where not exists (
      select 1
      from public.bundle_components bc
      where bc.bundle_sku_id = bt.component_sku_id
        and bc.qty_per_bundle > 0
    )
    group by bt.root_bundle_id, bt.component_sku_id
  ),
  leaf_shares as (
    select
      l.root_bundle_id,
      l.component_sku_id,
      l.qty_per_bundle,
      case
        when sum(
          case when coalesce(cs.retail_price, 0) > 0 then 1 else 0 end
        ) over w = count(*) over w
          and sum(coalesce(cs.retail_price, 0) * l.qty_per_bundle) over w > 0
        then (coalesce(cs.retail_price, 0) * l.qty_per_bundle)
          / nullif(sum(coalesce(cs.retail_price, 0) * l.qty_per_bundle) over w, 0)
        else l.qty_per_bundle
          / nullif(sum(l.qty_per_bundle) over w, 0)
      end as net_share
    from leaves l
    join public.skus cs on cs.id = l.component_sku_id
    window w as (partition by l.root_bundle_id)
  ),
  direct as (
    select
      sr.sku_id,
      sr.channel_id,
      extract(year from sr.sale_date)::integer as sale_year,
      extract(month from sr.sale_date)::integer as sale_month,
      sum(sr.qty_sold)::numeric as qty,
      sum(sr.net_sales)::numeric as net_sales
    from public.sales_records sr
    where sr.sale_date >= p_start
      and sr.sale_date <= p_end
    group by
      sr.sku_id,
      sr.channel_id,
      extract(year from sr.sale_date),
      extract(month from sr.sale_date)
  ),
  exploded as (
    select
      ls.component_sku_id as sku_id,
      sr.channel_id,
      extract(year from sr.sale_date)::integer as sale_year,
      extract(month from sr.sale_date)::integer as sale_month,
      sum(sr.qty_sold * ls.qty_per_bundle)::numeric as qty,
      sum(sr.net_sales * ls.net_share)::numeric as net_sales
    from public.sales_records sr
    join leaf_shares ls on ls.root_bundle_id = sr.sku_id
    where sr.sale_date >= p_start
      and sr.sale_date <= p_end
    group by
      ls.component_sku_id,
      sr.channel_id,
      extract(year from sr.sale_date),
      extract(month from sr.sale_date)
  )
  select
    u.sku_id,
    u.channel_id,
    u.sale_year,
    u.sale_month,
    sum(u.qty)::numeric as qty,
    sum(u.net_sales)::numeric as net_sales
  from (
    select sku_id, channel_id, sale_year, sale_month, qty, net_sales from direct
    union all
    select sku_id, channel_id, sale_year, sale_month, qty, net_sales from exploded
  ) u
  group by u.sku_id, u.channel_id, u.sale_year, u.sale_month;
$$;

comment on function public.get_sop_monthly_actuals(date, date) is
  'Monthly qty/net_sales by SKU and channel for S&OP. Bundle sales stay on the bundle SKU and also explode to leaf component SKUs.';

grant execute on function public.get_sop_monthly_actuals(date, date) to authenticated;
grant execute on function public.get_sop_monthly_actuals(date, date) to service_role;
