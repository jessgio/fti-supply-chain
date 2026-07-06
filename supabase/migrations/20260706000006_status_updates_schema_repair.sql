-- Idempotent repair: ensure status updates schema matches app expectations.

alter table public.status_updates
  add column if not exists applies_to_all_po_products boolean not null default false;

alter table public.status_updates
  add column if not exists updated_at timestamptz;

update public.status_updates
set updated_at = created_at
where updated_at is null;

create table if not exists public.status_update_refs (
  id uuid primary key default gen_random_uuid(),
  status_update_id uuid not null references public.status_updates (id) on delete cascade,
  entity_type public.status_update_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  constraint status_update_refs_unique unique (status_update_id, entity_type, entity_id),
  constraint status_update_refs_not_po check (entity_type <> 'po')
);

create index if not exists status_update_refs_update_id_idx
  on public.status_update_refs (status_update_id);

create table if not exists public.status_update_skus (
  id uuid primary key default gen_random_uuid(),
  status_update_id uuid not null references public.status_updates (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  constraint status_update_skus_unique unique (status_update_id, sku_id)
);

create index if not exists status_update_skus_sku_id_idx
  on public.status_update_skus (sku_id);

create index if not exists status_update_skus_update_id_idx
  on public.status_update_skus (status_update_id);

alter table public.status_update_refs enable row level security;
alter table public.status_update_skus enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'status_update_refs'
      and policyname = 'authenticated read status_update_refs'
  ) then
    create policy "authenticated read status_update_refs" on public.status_update_refs
      for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'status_update_skus'
      and policyname = 'authenticated read status_update_skus'
  ) then
    create policy "authenticated read status_update_skus" on public.status_update_skus
      for select to authenticated using (true);
  end if;
end $$;
