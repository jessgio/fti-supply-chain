-- Visual shade grid for product development master view

create table public.pd_master_shades (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  shade_name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index pd_master_shades_project_id_idx
  on public.pd_master_shades (project_id, sort_order);

alter table public.pd_files
  add column master_shade_id uuid references public.pd_master_shades (id) on delete cascade;

create index pd_files_master_shade_id_idx on public.pd_files (master_shade_id);

alter table public.pd_master_shades enable row level security;

create policy "authenticated read pd_master_shades" on public.pd_master_shades
  for select to authenticated using (true);

create policy "writer write pd_master_shades" on public.pd_master_shades
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
