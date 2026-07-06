alter table public.status_updates
  add column if not exists updated_at timestamptz;

update public.status_updates
set updated_at = created_at
where updated_at is null;

alter table public.status_updates
  alter column updated_at set default now();
