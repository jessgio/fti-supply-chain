-- Link finished-good SKUs to packaging components (BOM for procurement planning).

create table public.product_packaging (
  id uuid primary key default gen_random_uuid(),
  product_sku_id uuid not null references public.skus (id) on delete cascade,
  packaging_sku_id uuid not null references public.skus (id) on delete cascade,
  qty_per_unit numeric(12, 4) not null check (qty_per_unit > 0),
  created_at timestamptz not null default now(),
  unique (product_sku_id, packaging_sku_id),
  check (product_sku_id <> packaging_sku_id)
);

create index product_packaging_product_idx on public.product_packaging (product_sku_id);
create index product_packaging_packaging_idx on public.product_packaging (packaging_sku_id);

comment on table public.product_packaging is
  'How much of each packaging SKU is needed per unit of a finished-good SKU. '
  'Used to derive packaging PO quantities from finished-goods restock forecasts.';

alter table public.product_packaging enable row level security;

create policy "authenticated read product_packaging" on public.product_packaging
  for select to authenticated using (true);

create policy "writer write product_packaging" on public.product_packaging
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
