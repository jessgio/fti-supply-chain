-- Upcoming NPD stock: SKUs with no sales history yet that either have physical
-- stock in the forecast locations OR have an open purchase order (stock ordered
-- ahead of launch). These are excluded from the demand forecast (no sales
-- series, often not franchise-mapped), so surface them on their own.

create or replace function public.get_npd_stock_skus()
returns table (
  sku_code text,
  sku_name text,
  franchise_name text,
  qty_on_hand numeric,
  stock_as_of date
)
language sql
stable
as $$
  with latest_stock_date as (
    select coalesce(max(sl.as_of_date), current_date) as d
    from public.stock_levels sl
    where sl.location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
  ),
  stock_by_sku as (
    select
      sl.sku_id,
      coalesce(sum(sl.qty_on_hand), 0) as qty_on_hand
    from public.stock_levels sl
    cross join latest_stock_date lsd
    where sl.as_of_date = lsd.d
      and sl.location in (
        'Gudang Finished Goods',
        'Gudang Inventory',
        'Gudang Inventory Offline'
      )
    group by sl.sku_id
    having coalesce(sum(sl.qty_on_hand), 0) > 0
  ),
  open_po_skus as (
    select distinct pol.sku_id
    from public.purchase_order_lines pol
    join public.purchase_orders po on po.id = pol.po_id
    where po.status in ('planned', 'ordered', 'in_transit')
      and (pol.qty_ordered - pol.qty_received) > 0
  ),
  candidate_ids as (
    select sku_id from stock_by_sku
    union
    select sku_id from open_po_skus
  )
  select
    s.sku_code,
    s.name as sku_name,
    pf.name as franchise_name,
    coalesce(sbs.qty_on_hand, 0) as qty_on_hand,
    lsd.d as stock_as_of
  from candidate_ids c
  join public.skus s on s.id = c.sku_id
  cross join latest_stock_date lsd
  left join public.product_franchises pf on pf.id = s.franchise_id
  left join stock_by_sku sbs on sbs.sku_id = c.sku_id
  where s.is_bundle = false
    and not exists (
      select 1 from public.sales_records sr where sr.sku_id = s.id
    )
    and not exists (
      select 1
      from public.sales_records sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      where bc.component_sku_id = s.id
    )
  order by qty_on_hand desc, s.sku_code;
$$;
