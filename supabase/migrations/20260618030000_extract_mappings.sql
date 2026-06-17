-- Manufacturer action codes → internal extract categories, and manufacturer
-- item names → FTI extract records.

create table public.extract_action_code_mappings (
  id uuid primary key default gen_random_uuid(),
  action_code text not null,
  category public.extract_category not null,
  created_at timestamptz not null default now()
);

create unique index extract_action_code_mappings_code_idx
  on public.extract_action_code_mappings (lower(trim(action_code)));

create table public.extract_item_name_mappings (
  id uuid primary key default gen_random_uuid(),
  manufacturer_name text not null,
  extract_id uuid not null references public.extracts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index extract_item_name_mappings_name_idx
  on public.extract_item_name_mappings (lower(trim(manufacturer_name)));

create index extract_item_name_mappings_extract_idx
  on public.extract_item_name_mappings (extract_id);

-- Seed action codes from the existing FROM/TO pattern rules.
insert into public.extract_action_code_mappings (action_code, category)
select pattern, category
from public.extract_category_rules
order by priority;

alter table public.extract_action_code_mappings enable row level security;
alter table public.extract_item_name_mappings enable row level security;

create policy "authenticated read extract_action_code_mappings"
  on public.extract_action_code_mappings
  for select to authenticated using (true);
create policy "authenticated write extract_action_code_mappings"
  on public.extract_action_code_mappings
  for all to authenticated using (true) with check (true);

create policy "authenticated read extract_item_name_mappings"
  on public.extract_item_name_mappings
  for select to authenticated using (true);
create policy "authenticated write extract_item_name_mappings"
  on public.extract_item_name_mappings
  for all to authenticated using (true) with check (true);
