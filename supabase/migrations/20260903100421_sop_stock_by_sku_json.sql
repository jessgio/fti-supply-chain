-- Aggregate on-hand stock in one round trip so S&OP does not page
-- thousands of stock_levels rows through PostgREST.

create or replace function public.get_sop_stock_by_sku_json()
returns jsonb
language sql
stable
set search_path = public
as $$
  with latest as (
    select max(as_of_date) as as_of_date
    from public.stock_levels
    where location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('sku_id', s.sku_id, 'qty', s.qty)),
    '[]'::jsonb
  )
  from (
    select sl.sku_id, sum(sl.qty_on_hand)::numeric as qty
    from public.stock_levels sl
    join latest on sl.as_of_date = latest.as_of_date
    where sl.location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
    group by sl.sku_id
  ) s;
$$;

comment on function public.get_sop_stock_by_sku_json() is
  'On-hand qty by SKU for S&OP forecast, aggregated at the latest stock date.';

grant execute on function public.get_sop_stock_by_sku_json() to authenticated;
grant execute on function public.get_sop_stock_by_sku_json() to service_role;
