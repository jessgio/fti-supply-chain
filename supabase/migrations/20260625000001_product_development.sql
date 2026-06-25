-- Product Development module: projects, phases, components, files, chat, master view

create type public.pd_project_status as enum (
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled'
);

create type public.pd_phase_status as enum (
  'not_started',
  'in_progress',
  'completed',
  'delayed'
);

create type public.pd_component_type as enum (
  'formula',
  'shades',
  'ingredients',
  'scents',
  'packaging',
  'unit_box',
  'primary_packaging',
  'secondary_packaging',
  'applicator',
  'other'
);

create table public.pd_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status public.pd_project_status not null default 'draft',
  product_name text,
  launch_date date,
  product_claim text,
  net_weight text,
  volume_test_result text,
  retail_price numeric,
  currency text not null default 'IDR',
  key_ingredients text,
  full_inci_list text,
  shades_list text,
  ingredient_claims text,
  colorant_source text,
  precautions text,
  halal_certification text,
  stability_test text,
  hript text,
  efficacy_test text,
  technical_sheet text,
  master_view_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pd_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  name text not null,
  description text,
  sort_order int not null default 0,
  is_root_task boolean not null default false,
  parent_phase_id uuid references public.pd_phases (id) on delete set null,
  depends_on_phase_id uuid references public.pd_phases (id) on delete set null,
  start_date date,
  end_date date,
  duration_days int,
  actual_end_date date,
  status public.pd_phase_status not null default 'not_started',
  cycle_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pd_phase_pics (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.pd_phases (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  unique (phase_id, profile_id)
);

create table public.pd_phase_components (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.pd_phases (id) on delete cascade,
  component_type public.pd_component_type not null default 'other',
  name text not null,
  description text,
  sort_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.pd_packaging_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  part_name text not null,
  part_type text,
  supplier_code text,
  material_spec text,
  sort_order int not null default 0
);

create table public.pd_shade_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  shade_name text not null,
  lab_no text,
  mpd_confirmation text,
  bpom text,
  gs1 text,
  sort_order int not null default 0
);

create table public.pd_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  phase_id uuid references public.pd_phases (id) on delete cascade,
  component_id uuid references public.pd_phase_components (id) on delete cascade,
  shade_file_id uuid references public.pd_shade_files (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_category text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pd_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  body text not null,
  mentioned_user_ids uuid[] not null default '{}',
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.pd_cycle_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  phase_id uuid references public.pd_phases (id) on delete set null,
  title text,
  notes text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pd_phases_project_id_idx on public.pd_phases (project_id);
create index pd_phases_sort_order_idx on public.pd_phases (project_id, sort_order);
create index pd_phase_pics_phase_id_idx on public.pd_phase_pics (phase_id);
create index pd_phase_components_phase_id_idx on public.pd_phase_components (phase_id);
create index pd_files_project_id_idx on public.pd_files (project_id);
create index pd_chat_messages_project_id_idx on public.pd_chat_messages (project_id);
create index pd_cycle_notes_project_id_idx on public.pd_cycle_notes (project_id);
create index pd_packaging_items_project_id_idx on public.pd_packaging_items (project_id);
create index pd_shade_files_project_id_idx on public.pd_shade_files (project_id);

-- Allow authenticated users to read all profiles (for PIC picker and @mentions)
create policy "authenticated read profiles" on public.profiles
  for select to authenticated using (true);

alter table public.pd_projects enable row level security;
alter table public.pd_phases enable row level security;
alter table public.pd_phase_pics enable row level security;
alter table public.pd_phase_components enable row level security;
alter table public.pd_packaging_items enable row level security;
alter table public.pd_shade_files enable row level security;
alter table public.pd_files enable row level security;
alter table public.pd_chat_messages enable row level security;
alter table public.pd_cycle_notes enable row level security;

create policy "authenticated read pd_projects" on public.pd_projects
  for select to authenticated using (true);
create policy "authenticated read pd_phases" on public.pd_phases
  for select to authenticated using (true);
create policy "authenticated read pd_phase_pics" on public.pd_phase_pics
  for select to authenticated using (true);
create policy "authenticated read pd_phase_components" on public.pd_phase_components
  for select to authenticated using (true);
create policy "authenticated read pd_packaging_items" on public.pd_packaging_items
  for select to authenticated using (true);
create policy "authenticated read pd_shade_files" on public.pd_shade_files
  for select to authenticated using (true);
create policy "authenticated read pd_files" on public.pd_files
  for select to authenticated using (true);
create policy "authenticated read pd_chat_messages" on public.pd_chat_messages
  for select to authenticated using (true);
create policy "authenticated read pd_cycle_notes" on public.pd_cycle_notes
  for select to authenticated using (true);

do $$
declare
  t text;
  write_tables text[] := array[
    'pd_projects',
    'pd_phases',
    'pd_phase_pics',
    'pd_phase_components',
    'pd_packaging_items',
    'pd_shade_files',
    'pd_files',
    'pd_chat_messages',
    'pd_cycle_notes'
  ];
begin
  foreach t in array write_tables loop
    execute format(
      'create policy "writer write %s" on public.%I for all to authenticated '
      || 'using (public.current_user_role() in (''admin'', ''supply_chain'')) '
      || 'with check (public.current_user_role() in (''admin'', ''supply_chain''))',
      t, t
    );
  end loop;
end $$;

-- Chat: all authenticated users may post messages
create policy "authenticated insert pd_chat_messages" on public.pd_chat_messages
  for insert to authenticated
  with check (auth.uid() = author_id);
