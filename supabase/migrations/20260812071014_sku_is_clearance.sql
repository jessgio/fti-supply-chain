-- Mark SKUs as clearance so they stay visible in forecast but are not restocked.

alter table public.skus
  add column if not exists is_clearance boolean not null default false;

comment on column public.skus.is_clearance is
  'When true, SKU remains in inventory forecast for sell-through visibility but is excluded from reorder-now / restock recommendations (flushing stock).';

create index if not exists skus_is_clearance_idx on public.skus (is_clearance)
  where is_clearance = true;
