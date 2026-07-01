-- Link saved timelines to catalog SKUs when the product is a restock.

alter table public.product_timelines
  add column sku_id uuid references public.skus (id) on delete set null;

create index product_timelines_sku_id_idx
  on public.product_timelines (sku_id);
