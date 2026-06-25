-- Free-text duration labels (e.g. "3 mons", "14 edays", "2 wks")
alter table public.pd_phases
  add column if not exists duration_text text;
