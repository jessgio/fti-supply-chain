-- WMS exports can include negative QTY (returns, cancellations)

alter table public.sales_records
  drop constraint if exists sales_records_qty_sold_check;

alter table public.sales_records
  add constraint sales_records_qty_sold_check
  check (qty_sold >= -9999999999);
