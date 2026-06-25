-- Formula Tracker: NPD confirmation metadata and product project link

alter table public.pd_formula_tracker_entries
  add column confirmation_date date,
  add column confirmed_by text,
  add column product_project_id uuid references public.pd_projects (id) on delete set null;

create index pd_formula_tracker_entries_product_project_id_idx
  on public.pd_formula_tracker_entries (product_project_id);
