-- Regulatory fields per master shade (supporting files table)

alter table public.pd_master_shades
  add column if not exists lab_no text,
  add column if not exists gs1 text;
