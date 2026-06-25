-- Packaging & asset details text fields and Pantone swatches

create table public.pd_packaging_asset_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  field_key text not null,
  value text,
  unique (project_id, field_key)
);

create index pd_packaging_asset_fields_project_id_idx
  on public.pd_packaging_asset_fields (project_id);

create table public.pd_pantone_swatches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  color_name text not null,
  pantone_code text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index pd_pantone_swatches_project_id_idx
  on public.pd_pantone_swatches (project_id, sort_order);

alter table public.pd_files
  add column if not exists pantone_swatch_id uuid references public.pd_pantone_swatches (id) on delete cascade;

create index pd_files_pantone_swatch_id_idx on public.pd_files (pantone_swatch_id);

alter table public.pd_packaging_asset_fields enable row level security;
alter table public.pd_pantone_swatches enable row level security;

create policy "authenticated read pd_packaging_asset_fields"
  on public.pd_packaging_asset_fields for select to authenticated using (true);

create policy "writer write pd_packaging_asset_fields"
  on public.pd_packaging_asset_fields for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "authenticated read pd_pantone_swatches"
  on public.pd_pantone_swatches for select to authenticated using (true);

create policy "writer write pd_pantone_swatches"
  on public.pd_pantone_swatches for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
