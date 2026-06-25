-- Master view: ingredient fields and volume test as uploadable document

alter table public.pd_projects
  add column if not exists extract text,
  add column if not exists ingredient_concept text,
  add column if not exists scent_fragrance text;
