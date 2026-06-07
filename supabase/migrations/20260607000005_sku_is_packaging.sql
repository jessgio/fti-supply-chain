-- Mark SKUs as primary packaging materials (UB, EFLUTE, JAR, PUMP, etc.)
-- for supply-chain tracking separate from finished-goods inventory forecast.

alter table public.skus
  add column if not exists is_packaging boolean not null default false;

comment on column public.skus.is_packaging is
  'When true, SKU is primary packaging material tracked in the packaging module (inventory + POs). Independent of franchise mapping and product forecast.';

create index if not exists skus_is_packaging_idx on public.skus (is_packaging)
  where is_packaging = true;
