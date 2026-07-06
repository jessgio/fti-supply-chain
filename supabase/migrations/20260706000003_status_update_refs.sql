-- Multiple connected records per status update (payment, shipment, inbound, delivery notes).

create table public.status_update_refs (
  id uuid primary key default gen_random_uuid(),
  status_update_id uuid not null references public.status_updates (id) on delete cascade,
  entity_type public.status_update_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  constraint status_update_refs_unique unique (status_update_id, entity_type, entity_id),
  constraint status_update_refs_not_po check (entity_type <> 'po')
);

create index status_update_refs_update_id_idx
  on public.status_update_refs (status_update_id);

alter table public.status_update_refs enable row level security;

create policy "authenticated read status_update_refs" on public.status_update_refs
  for select to authenticated using (true);

create policy "authenticated insert status_update_refs" on public.status_update_refs
  for insert to authenticated with check (true);

do $$
begin
  execute format(
    'create policy "writer write status_update_refs" on public.status_update_refs for all to authenticated '
    || 'using (public.current_user_role() in (''admin'', ''supply_chain'')) '
    || 'with check (public.current_user_role() in (''admin'', ''supply_chain''))'
  );
end $$;
