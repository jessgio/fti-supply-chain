-- Per-channel (Online/Offline) inactive SKUs for S&OP forecast.
-- Presence of a row means the SKU is hidden from that group's main forecast table.

create table public.sop_sku_channel_inactive (
  sku_id uuid not null references public.skus (id) on delete cascade,
  sop_group public.sop_channel_group not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (sku_id, sop_group)
);

create index sop_sku_channel_inactive_group_idx
  on public.sop_sku_channel_inactive (sop_group);

comment on table public.sop_sku_channel_inactive is
  'SKUs marked inactive for an S&OP channel group; excluded from that group''s main forecast table.';

alter table public.sop_sku_channel_inactive enable row level security;

create policy "authenticated read sop_sku_channel_inactive"
  on public.sop_sku_channel_inactive for select to authenticated using (true);

create policy "commercial write sop_sku_channel_inactive"
  on public.sop_sku_channel_inactive for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'))
  with check (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'));
