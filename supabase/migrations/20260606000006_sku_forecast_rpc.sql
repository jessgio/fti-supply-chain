-- Fast forecast inputs: one row per SKU with recent daily demand series

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
      fse.sku_code,
      fse.sale_date,
      sum(fse.qty_sold)::numeric as qty
    from public.franchise_sales_expanded fse
    cross join window_bounds wb
    where fse.sale_date between wb.history_start and wb.stock_as_of
    group by fse.sku_code, fse.sale_date
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
      array_agg(coalesce(d.qty, 0) order by gs.sale_date) as demand_qtys,
      count(d.qty)::integer as history_days
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
    coalesce(ds.history_days, 0) as history_days,
    coalesce(ds.demand_qtys, array[]::numeric[]) as demand_qtys
  from stock_by_sku st
  inner join active_skus a on a.sku_code = st.sku_code
  left join demand_series ds on ds.sku_code = st.sku_code
  order by st.qty_on_hand asc, st.sku_code;
$$;
