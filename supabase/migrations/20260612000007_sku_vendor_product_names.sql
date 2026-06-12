-- Vendor-facing product names for SKUs on purchase order printouts

create table public.sku_vendor_product_names (
  sku_id uuid primary key references public.skus (id) on delete cascade,
  vendor_product_name text not null,
  updated_at timestamptz not null default now()
);

create index sku_vendor_product_names_updated_idx
  on public.sku_vendor_product_names (updated_at desc);

alter table public.sku_vendor_product_names enable row level security;

create policy "authenticated read sku_vendor_product_names"
  on public.sku_vendor_product_names
  for select to authenticated using (true);

create policy "authenticated write sku_vendor_product_names"
  on public.sku_vendor_product_names
  for all to authenticated using (true) with check (true);
