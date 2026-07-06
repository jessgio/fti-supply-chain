-- Status updates: SKU-scoped notes linked to PO, payment, shipment, or inbound with threaded replies.

create type public.status_update_entity_type as enum (
  'po',
  'payment',
  'shipment',
  'inbound'
);

create table public.status_updates (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id) on delete cascade,
  entity_type public.status_update_entity_type not null,
  entity_id uuid not null,
  body text not null,
  mentioned_user_ids uuid[] not null default '{}',
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.status_update_replies (
  id uuid primary key default gen_random_uuid(),
  status_update_id uuid not null references public.status_updates (id) on delete cascade,
  body text not null,
  mentioned_user_ids uuid[] not null default '{}',
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index status_updates_sku_id_created_at_idx
  on public.status_updates (sku_id, created_at desc);

create index status_updates_entity_idx
  on public.status_updates (entity_type, entity_id);

create index status_update_replies_update_id_idx
  on public.status_update_replies (status_update_id, created_at asc);

alter table public.status_updates enable row level security;
alter table public.status_update_replies enable row level security;

create policy "authenticated read status_updates" on public.status_updates
  for select to authenticated using (true);

create policy "authenticated read status_update_replies" on public.status_update_replies
  for select to authenticated using (true);

create policy "authenticated insert status_updates" on public.status_updates
  for insert to authenticated
  with check (auth.uid() = author_id);

create policy "authenticated insert status_update_replies" on public.status_update_replies
  for insert to authenticated
  with check (auth.uid() = author_id);

do $$
declare
  t text;
  write_tables text[] := array['status_updates', 'status_update_replies'];
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
