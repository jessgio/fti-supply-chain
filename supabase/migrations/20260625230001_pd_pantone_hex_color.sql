-- Cache resolved hex for Pantone swatches (approximate screen preview)

alter table public.pd_pantone_swatches
  add column if not exists hex_color text;
