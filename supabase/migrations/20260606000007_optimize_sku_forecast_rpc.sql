-- Forecast RPC: aggregate demand from sales_records directly (skip franchise_sales_expanded view)

create or replace function public.get_sku_forecast_base(
  p_history_days integer default 90,
  p_ewma_days integer default 30
)
returns table (
  sku_code text,
  franchise_name text,
  qty_on_hand numeric,
  stock_as_of date,
  history_days integer,
  demand_qtys numeric[]
)
language sql
stable
as $$
  with latest_stock_date as (
    select coalesce(max(as_of_date), current_date) as d
    from public.stock_levels
  ),
  window_bounds as (
    select
      d as stock_as_of,
      d - (p_ewma_days - 1) as ewma_start,
      d - p_history_days as history_start
    from latest_stock_date
  ),
  daily as (
    select
      expanded.sku_code,
      expanded.sale_date,
      sum(expanded.qty_sold)::numeric as qty
    from (
      select
        s.sku_code,
        sr.sale_date,
        sr.qty_sold
      from public.sales_records sr
      join public.skus s on s.id = sr.sku_id
      cross join window_bounds wb
      where s.is_bundle = false
        and sr.sale_date between wb.history_start and wb.stock_as_of

      union all

      select
        cs.sku_code,
        sr.sale_date,
        sr.qty_sold * bc.qty_per_bundle as qty_sold
      from public.sales_records sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      join public.skus cs on cs.id = bc.component_sku_id
      cross join window_bounds wb
      where sr.sale_date between wb.history_start and wb.stock_as_of
    ) expanded
    group by expanded.sku_code, expanded.sale_date
  ),
  history_counts as (
    select
      sku_code,
      count(*)::integer as history_days
    from daily
    where qty > 0
    group by sku_code
  ),
  stock_by_sku as (
    select
      s.sku_code,
      pf.name as franchise_name,
      coalesce(sum(sl.qty_on_hand), 0) as qty_on_hand,
      wb.stock_as_of
    from public.skus s
    cross join window_bounds wb
    left join public.product_franchises pf on pf.id = s.franchise_id
    left join public.stock_levels sl
      on sl.sku_id = s.id and sl.as_of_date = wb.stock_as_of
    where s.is_bundle = false
    group by s.sku_code, pf.name, wb.stock_as_of
  ),
  active_skus as (
    select sku_code from stock_by_sku where qty_on_hand > 0
    union
    select distinct sku_code from daily
  ),
  demand_series as (
    select
      a.sku_code,
      array_agg(coalesce(d.qty, 0) order by gs.sale_date) as demand_qtys
    from active_skus a
    cross join window_bounds wb
    cross join lateral (
      select generate_series(
        wb.ewma_start,
        wb.stock_as_of,
        interval '1 day'
      )::date as sale_date
    ) gs
    left join daily d
      on d.sku_code = a.sku_code and d.sale_date = gs.sale_date
    group by a.sku_code
  )
  select
    st.sku_code,
    st.franchise_name,
    st.qty_on_hand,
    st.stock_as_of,
    coalesce(hc.history_days, 0) as history_days,
    coalesce(ds.demand_qtys, array[]::numeric[]) as demand_qtys
  from stock_by_sku st
  inner join active_skus a on a.sku_code = st.sku_code
  left join demand_series ds on ds.sku_code = st.sku_code
  left join history_counts hc on hc.sku_code = st.sku_code
  order by st.qty_on_hand asc, st.sku_code;
$$;
