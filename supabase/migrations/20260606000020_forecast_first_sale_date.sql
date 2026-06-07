-- Expose all-time first sale date per mapped SKU (for NPD / demand-pattern classification).

drop function if exists public.get_sku_forecast_base(integer, integer);

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
  demand_start_date date,
  first_sale_date date,
  demand_qtys numeric[]
)
language sql
stable
as $$
  with month_bounds as (
    select
      date_trunc('month', current_date)::date as current_month_start,
      (date_trunc('month', current_date) - interval '6 months')::date as l6m_start,
      (date_trunc('month', current_date) - interval '1 day')::date as l6m_end
  ),
  latest_stock_date as (
    select coalesce(max(sl.as_of_date), current_date) as d
    from public.stock_levels sl
    where sl.location in ('Gudang Finished Goods', 'Gudang Inventory')
  ),
  window_bounds as (
    select
      ls.d as stock_as_of,
      mb.l6m_start as demand_start,
      mb.l6m_end as demand_end
    from latest_stock_date ls
    cross join month_bounds mb
  ),
  mapped_skus as (
    select s.id, s.sku_code, pf.name as franchise_name
    from public.skus s
    join public.product_franchises pf on pf.id = s.franchise_id
    where s.is_bundle = false
      and s.franchise_id is not null
  ),
  first_sales as (
    select
      expanded.sku_code,
      min(expanded.sale_date) as first_sale_date
    from (
      select ms.sku_code, sr.sale_date
      from public.sales_records sr
      join mapped_skus ms on ms.id = sr.sku_id
      where sr.qty_sold > 0

      union all

      select
        ms.sku_code,
        sr.sale_date
      from public.sales_records sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      join mapped_skus ms on ms.id = bc.component_sku_id
      where sr.qty_sold * bc.qty_per_bundle > 0
    ) expanded
    group by expanded.sku_code
  ),
  daily as (
    select
      expanded.sku_code,
      expanded.sale_date,
      sum(expanded.qty_sold)::numeric as qty
    from (
      select
        ms.sku_code,
        sr.sale_date,
        sr.qty_sold
      from public.sales_records sr
      join mapped_skus ms on ms.id = sr.sku_id
      cross join window_bounds wb
      where sr.sale_date between wb.demand_start and wb.demand_end

      union all

      select
        ms.sku_code,
        sr.sale_date,
        sr.qty_sold * bc.qty_per_bundle as qty_sold
      from public.sales_records sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      join mapped_skus ms on ms.id = bc.component_sku_id
      cross join window_bounds wb
      where sr.sale_date between wb.demand_start and wb.demand_end
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
      ms.sku_code,
      ms.franchise_name,
      coalesce(sum(sl.qty_on_hand), 0) as qty_on_hand,
      wb.stock_as_of
    from mapped_skus ms
    cross join window_bounds wb
    left join public.stock_levels sl
      on sl.sku_id = ms.id
      and sl.as_of_date = wb.stock_as_of
      and sl.location in ('Gudang Finished Goods', 'Gudang Inventory')
    group by ms.sku_code, ms.franchise_name, wb.stock_as_of
  ),
  active_skus as (
    select sku_code from stock_by_sku where qty_on_hand <> 0
    union
    select distinct sku_code from daily
  ),
  demand_series as (
    select
      a.sku_code,
      wb.demand_start,
      array_agg(coalesce(d.qty, 0) order by gs.sale_date) as demand_qtys
    from active_skus a
    cross join window_bounds wb
    cross join lateral (
      select generate_series(
        wb.demand_start,
        wb.demand_end,
        interval '1 day'
      )::date as sale_date
    ) gs
    left join daily d
      on d.sku_code = a.sku_code and d.sale_date = gs.sale_date
    group by a.sku_code, wb.demand_start
  )
  select
    st.sku_code,
    st.franchise_name,
    st.qty_on_hand,
    st.stock_as_of,
    coalesce(hc.history_days, 0) as history_days,
    ds.demand_start as demand_start_date,
    fs.first_sale_date,
    coalesce(ds.demand_qtys, array[]::numeric[]) as demand_qtys
  from stock_by_sku st
  inner join active_skus a on a.sku_code = st.sku_code
  left join demand_series ds on ds.sku_code = st.sku_code
  left join history_counts hc on hc.sku_code = st.sku_code
  left join first_sales fs on fs.sku_code = st.sku_code
  order by st.qty_on_hand asc, st.sku_code;
$$;
