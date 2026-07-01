-- Extract inbound delivery notes: internal team ships extract to manufacturer (Cosmax)

create table public.extract_codes (
  id uuid primary key default gen_random_uuid(),
  item_code text not null,
  extract_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint extract_codes_item_code_unique unique (item_code)
);

create index extract_codes_active_idx
  on public.extract_codes (is_active)
  where is_active = true;

create table public.extract_inbound_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  dn_number text not null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  po_number text not null,
  delivery_date date not null,
  recipient_name text not null,
  special_instruction text,
  created_at timestamptz not null default now(),
  constraint extract_inbound_delivery_notes_dn_number_unique unique (dn_number)
);

create index extract_inbound_delivery_notes_created_at_idx
  on public.extract_inbound_delivery_notes (created_at desc);
create index extract_inbound_delivery_notes_po_id_idx
  on public.extract_inbound_delivery_notes (po_id);

create table public.extract_inbound_delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.extract_inbound_delivery_notes (id) on delete cascade,
  extract_code_id uuid references public.extract_codes (id) on delete set null,
  item_code text not null,
  extract_name text not null,
  quantity numeric(18, 5) not null,
  uom_kg numeric(18, 5) not null,
  total_kg numeric(18, 5) not null,
  constraint extract_inbound_dn_lines_quantity_positive check (quantity > 0),
  constraint extract_inbound_dn_lines_uom_positive check (uom_kg > 0),
  constraint extract_inbound_dn_lines_total_positive check (total_kg > 0)
);

create index extract_inbound_delivery_note_lines_note_id_idx
  on public.extract_inbound_delivery_note_lines (delivery_note_id);

alter table public.extract_codes enable row level security;
alter table public.extract_inbound_delivery_notes enable row level security;
alter table public.extract_inbound_delivery_note_lines enable row level security;

create policy "read extract codes" on public.extract_codes
  for select to authenticated using (true);

create policy "write extract codes" on public.extract_codes
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "read extract inbound delivery notes" on public.extract_inbound_delivery_notes
  for select to authenticated using (true);

create policy "write extract inbound delivery notes" on public.extract_inbound_delivery_notes
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create policy "read extract inbound delivery note lines" on public.extract_inbound_delivery_note_lines
  for select to authenticated using (true);
