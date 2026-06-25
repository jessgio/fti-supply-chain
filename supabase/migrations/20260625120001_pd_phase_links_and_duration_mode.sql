-- Phase many-to-many links (dependencies + parallel) and duration mode

create type public.pd_duration_mode as enum ('effective_days', 'working_days');

create type public.pd_phase_link_type as enum ('depends_on', 'parallel_with');

alter table public.pd_phases
  add column if not exists duration_mode public.pd_duration_mode not null default 'working_days';

create table if not exists public.pd_phase_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  from_phase_id uuid not null references public.pd_phases (id) on delete cascade,
  to_phase_id uuid not null references public.pd_phases (id) on delete cascade,
  link_type public.pd_phase_link_type not null,
  created_at timestamptz not null default now(),
  unique (from_phase_id, to_phase_id, link_type),
  check (from_phase_id <> to_phase_id)
);

create index if not exists pd_phase_links_project_id_idx
  on public.pd_phase_links (project_id);
create index if not exists pd_phase_links_from_phase_id_idx
  on public.pd_phase_links (from_phase_id);
create index if not exists pd_phase_links_to_phase_id_idx
  on public.pd_phase_links (to_phase_id);

-- Migrate legacy single dependency column into link rows
insert into public.pd_phase_links (project_id, from_phase_id, to_phase_id, link_type)
select p.project_id, p.id, p.depends_on_phase_id, 'depends_on'::public.pd_phase_link_type
from public.pd_phases p
where p.depends_on_phase_id is not null
on conflict (from_phase_id, to_phase_id, link_type) do nothing;

alter table public.pd_phase_links enable row level security;

create policy "authenticated read pd_phase_links" on public.pd_phase_links
  for select to authenticated using (true);

create policy "writer write pd_phase_links" on public.pd_phase_links
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
