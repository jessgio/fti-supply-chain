-- Primary packaging delivery notes: catalog + internal DN records (cartons/pcs)

create table public.primary_packaging_inbound_cosmax (
  id uuid primary key default gen_random_uuid(),
  item_code text not null,
  product_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint primary_packaging_item_code_length check (char_length(item_code) = 12),
  constraint primary_packaging_item_code_unique unique (item_code)
);

create index primary_packaging_inbound_cosmax_active_idx
  on public.primary_packaging_inbound_cosmax (is_active)
  where is_active = true;

create table public.primary_packaging_dn_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000005',
  recipient_company text not null default 'PT. Guru Indonesia',
  recipient_address text not null default
    'Cosmax Distribution Center (CDC), Jl. Curug Dengdeng, Desa Lulut, GW7F+VH7, Nambo, Klapanunggal, Bogor Regency, West Java 16710',
  recipient_pic_name text,
  recipient_phone text,
  recipient_email text,
  updated_at timestamptz not null default now()
);

insert into public.primary_packaging_dn_settings (id)
values ('00000000-0000-0000-0000-000000000005');

create table public.primary_packaging_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  dn_number text not null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  po_number text not null,
  delivery_date date not null,
  recipient_name text not null,
  created_at timestamptz not null default now(),
  constraint primary_packaging_delivery_notes_dn_number_unique unique (dn_number)
);

create index primary_packaging_delivery_notes_created_at_idx
  on public.primary_packaging_delivery_notes (created_at desc);
create index primary_packaging_delivery_notes_po_id_idx
  on public.primary_packaging_delivery_notes (po_id);

create table public.primary_packaging_delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.primary_packaging_delivery_notes (id) on delete cascade,
  packaging_item_id uuid references public.primary_packaging_inbound_cosmax (id) on delete set null,
  item_code text not null,
  product_name text not null,
  cartons integer not null,
  pcs_per_carton integer not null,
  total_pcs integer not null,
  constraint primary_packaging_dn_lines_cartons_positive check (cartons > 0),
  constraint primary_packaging_dn_lines_pcs_per_carton_positive check (pcs_per_carton > 0),
  constraint primary_packaging_dn_lines_total_pcs_positive check (total_pcs > 0)
);

create index primary_packaging_delivery_note_lines_note_id_idx
  on public.primary_packaging_delivery_note_lines (delivery_note_id);

alter table public.primary_packaging_inbound_cosmax enable row level security;
alter table public.primary_packaging_dn_settings enable row level security;
alter table public.primary_packaging_delivery_notes enable row level security;
alter table public.primary_packaging_delivery_note_lines enable row level security;

create policy "read primary packaging catalog" on public.primary_packaging_inbound_cosmax
  for select to authenticated using (true);

create policy "write primary packaging catalog" on public.primary_packaging_inbound_cosmax
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "read primary packaging dn settings" on public.primary_packaging_dn_settings
  for select to authenticated using (true);

create policy "write primary packaging dn settings" on public.primary_packaging_dn_settings
  for update to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "read primary packaging delivery notes" on public.primary_packaging_delivery_notes
  for select to authenticated using (true);

create policy "write primary packaging delivery notes" on public.primary_packaging_delivery_notes
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "read primary packaging delivery note lines" on public.primary_packaging_delivery_note_lines
  for select to authenticated using (true);

alter type public.status_update_entity_type add value if not exists 'primary_packaging_delivery_note';
