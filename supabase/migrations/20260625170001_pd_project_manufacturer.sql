-- Manufacturer name for product development projects (shown on project cards)

alter table public.pd_projects
  add column if not exists manufacturer text;
