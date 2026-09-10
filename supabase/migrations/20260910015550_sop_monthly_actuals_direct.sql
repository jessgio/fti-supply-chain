-- Franchise rollup explodes bundles itself. Keep this RPC as sold-SKU actuals
-- only so single-SKU rows are not pre-exploded (which double-counted in franchise view).

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
    extract(month from sr.sale_date);
$$;

comment on function public.get_sop_monthly_actuals(date, date) is
  'Monthly qty/net_sales by sold SKU and channel. Bundle explosion is applied in S&OP UI (SKU view and franchise rollup), not here.';

grant execute on function public.get_sop_monthly_actuals(date, date) to authenticated;
grant execute on function public.get_sop_monthly_actuals(date, date) to service_role;
