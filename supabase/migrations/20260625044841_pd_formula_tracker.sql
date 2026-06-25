-- Formula Tracker: sample/trial tracking per product development project

create table public.pd_formula_tracker_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  brief_concept text,
  target_ingredient text,
  product_name text,
  parent_items text,
  sample_date date,
  sample_trial_no text,
  lab_no text,
  texture_review text,
  scent text,
  texture_benchmark text,
  color_benchmark text,
  benchmark_change_confirmation text,
  benchmark_change_reason text,
  efficacy_result text,
  main_feedback text,
  texture_feedback text,
  scent_feedback text,
  scent_review text,
  efficacy_feedback text,
  summary text,
  npd_confirmation text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pd_files
  add column formula_tracker_entry_id uuid references public.pd_formula_tracker_entries (id) on delete cascade;

create index pd_formula_tracker_entries_project_id_idx
  on public.pd_formula_tracker_entries (project_id);
create index pd_files_formula_tracker_entry_id_idx
  on public.pd_files (formula_tracker_entry_id);

alter table public.pd_formula_tracker_entries enable row level security;

create policy "authenticated read pd_formula_tracker_entries"
  on public.pd_formula_tracker_entries
  for select to authenticated using (true);

create policy "writer write pd_formula_tracker_entries"
  on public.pd_formula_tracker_entries
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
