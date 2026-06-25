-- Price breakdown, supplier links, and offer letter attachments per PD project

alter table public.pd_projects
  add column if not exists asp numeric,
  add column if not exists pricing_rmb_rate numeric,
  add column if not exists pricing_usd_rate numeric,
  add column if not exists pricing_note text;

create table public.pd_pricing_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pd_projects (id) on delete cascade,
  line_key text not null,
  amount numeric,
  supplier_id uuid references public.suppliers (id) on delete set null,
  offer_note text,
  sort_order int not null default 0,
  unique (project_id, line_key)
);

create index pd_pricing_lines_project_id_idx
  on public.pd_pricing_lines (project_id, sort_order);

alter table public.pd_files
  add column if not exists pricing_line_id uuid references public.pd_pricing_lines (id) on delete cascade;

create index pd_files_pricing_line_id_idx on public.pd_files (pricing_line_id);

alter table public.pd_pricing_lines enable row level security;

create policy "authenticated read pd_pricing_lines" on public.pd_pricing_lines
  for select to authenticated using (true);

create policy "writer write pd_pricing_lines" on public.pd_pricing_lines
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
