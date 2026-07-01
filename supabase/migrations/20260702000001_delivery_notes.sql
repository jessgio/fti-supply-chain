-- Delivery Note module: external portal, secondary packaging catalog, and PDF records

-- Secondary Packaging Inbound to Cosmax product catalog (populated later)
create table public.secondary_packaging_inbound_cosmax (
  id uuid primary key default gen_random_uuid(),
  item_code text not null,
  product_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint secondary_packaging_item_code_length check (char_length(item_code) = 12),
  constraint secondary_packaging_item_code_unique unique (item_code)
);

create index secondary_packaging_inbound_cosmax_active_idx
  on public.secondary_packaging_inbound_cosmax (is_active)
  where is_active = true;

-- Singleton settings for Cosmax recipient block on delivery note PDFs
create table public.delivery_note_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000002',
  recipient_company text not null default 'PT. Guru Indonesia',
  recipient_address text not null default
    'Cosmax Distribution Center (CDC), Jl. Curug Dengdeng, Desa Lulut, GW7F+VH7, Nambo, Klapanunggal, Bogor Regency, West Java 16710',
  recipient_pic_name text,
  recipient_phone text,
  recipient_email text,
  updated_at timestamptz not null default now()
);

insert into public.delivery_note_settings (id) values ('00000000-0000-0000-0000-000000000002');

-- External portal access token (single external user)
create table public.delivery_note_portal (
  id uuid primary key default '00000000-0000-0000-0000-000000000003',
  access_token text not null,
  label text not null default 'External delivery note portal',
  updated_at timestamptz not null default now(),
  constraint delivery_note_portal_access_token_unique unique (access_token)
);

-- Seed with a random token; admins can regenerate from the dashboard
insert into public.delivery_note_portal (id, access_token)
values (
  '00000000-0000-0000-0000-000000000003',
  encode(gen_random_bytes(32), 'hex')
);

create table public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  dn_number text not null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  po_number text not null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  delivery_date date not null,
  recipient_name text not null,
  created_at timestamptz not null default now(),
  constraint delivery_notes_dn_number_unique unique (dn_number)
);

create index delivery_notes_created_at_idx on public.delivery_notes (created_at desc);
create index delivery_notes_po_id_idx on public.delivery_notes (po_id);

create table public.delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes (id) on delete cascade,
  packaging_item_id uuid references public.secondary_packaging_inbound_cosmax (id) on delete set null,
  item_code text not null,
  product_name text not null,
  cartons integer not null,
  pcs_per_carton integer not null,
  total_pcs integer not null,
  constraint delivery_note_lines_cartons_positive check (cartons > 0),
  constraint delivery_note_lines_pcs_per_carton_positive check (pcs_per_carton > 0),
  constraint delivery_note_lines_total_pcs_positive check (total_pcs > 0)
);

create index delivery_note_lines_note_id_idx on public.delivery_note_lines (delivery_note_id);

-- RLS
alter table public.secondary_packaging_inbound_cosmax enable row level security;
alter table public.delivery_note_settings enable row level security;
alter table public.delivery_note_portal enable row level security;
alter table public.delivery_notes enable row level security;
alter table public.delivery_note_lines enable row level security;

create policy "read secondary packaging" on public.secondary_packaging_inbound_cosmax
  for select to authenticated using (true);

create policy "write secondary packaging" on public.secondary_packaging_inbound_cosmax
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "read delivery note settings" on public.delivery_note_settings
  for select to authenticated using (true);

create policy "write delivery note settings" on public.delivery_note_settings
  for update to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "read delivery notes" on public.delivery_notes
  for select to authenticated using (true);

create policy "read delivery note lines" on public.delivery_note_lines
  for select to authenticated using (true);

-- Portal token is only accessed via service role (no authenticated policies)
