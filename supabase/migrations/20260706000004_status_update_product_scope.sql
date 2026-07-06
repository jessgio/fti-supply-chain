-- Product scope: all SKUs on a PO vs selected SKUs only.

alter table public.status_updates
  add column if not exists applies_to_all_po_products boolean not null default false;

create table public.status_update_skus (
  id uuid primary key default gen_random_uuid(),
  status_update_id uuid not null references public.status_updates (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  constraint status_update_skus_unique unique (status_update_id, sku_id)
);

create index status_update_skus_sku_id_idx
  on public.status_update_skus (sku_id);

create index status_update_skus_update_id_idx
  on public.status_update_skus (status_update_id);

alter table public.status_update_skus enable row level security;

create policy "authenticated read status_update_skus" on public.status_update_skus
  for select to authenticated using (true);

create policy "authenticated insert status_update_skus" on public.status_update_skus
  for insert to authenticated with check (true);

do $$
begin
  execute format(
    'create policy "writer write status_update_skus" on public.status_update_skus for all to authenticated '
    || 'using (public.current_user_role() in (''admin'', ''supply_chain'')) '
    || 'with check (public.current_user_role() in (''admin'', ''supply_chain''))'
  );
end $$;
