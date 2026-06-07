-- WMS exports can include negative Nett Sales (returns, adjustments)

alter table public.sales_records
  drop constraint if exists sales_records_net_sales_check;

alter table public.sales_records
  add constraint sales_records_net_sales_check
  check (net_sales >= -9999999999);
