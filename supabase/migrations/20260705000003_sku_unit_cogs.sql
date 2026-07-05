-- Per-SKU unit cost (COGS) for profitability analysis

alter table public.skus
  add column if not exists unit_cogs numeric(14, 5) check (unit_cogs is null or unit_cogs >= 0);

comment on column public.skus.unit_cogs is
  'Unit cost of goods sold (COGS) in IDR. Used for franchise profitability analysis.';
