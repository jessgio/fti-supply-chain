-- Shipments and inbound receives: track PO production/shipping and warehouse receipts.

create type public.shipment_type as enum ('sea', 'air', 'local');

create type public.shipment_status as enum (
  'planned',
  'in_transit',
  'delivered',
  'closed'
);

create type public.inbound_receive_status as enum (
  'pending',
  'partial',
  'complete'
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null unique,
  shipment_type public.shipment_type not null default 'sea',
  status public.shipment_status not null default 'planned',
  estimated_departure_date date not null,
  transit_days integer not null default 21 check (transit_days >= 0),
  delay_days integer not null default 0 check (delay_days >= 0),
  expected_delivery_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipments_status_idx on public.shipments (status);
create index shipments_departure_idx on public.shipments (estimated_departure_date);
create index shipments_delivery_idx on public.shipments (expected_delivery_date);

create table public.shipment_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  unique (shipment_id, po_id)
);

create index shipment_purchase_orders_po_idx on public.shipment_purchase_orders (po_id);

create table public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  po_line_id uuid not null references public.purchase_order_lines (id) on delete cascade,
  quantity numeric(14, 4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (shipment_id, po_line_id)
);

create index shipment_items_po_line_idx on public.shipment_items (po_line_id);

create table public.inbound_receives (
  id uuid primary key default gen_random_uuid(),
  receive_number text,
  po_id uuid references public.purchase_orders (id) on delete cascade,
  shipment_id uuid references public.shipments (id) on delete cascade,
  receive_date date not null default current_date,
  status public.inbound_receive_status not null default 'pending',
  received_by text,
  notes text,
  created_at timestamptz not null default now()
);

create unique index inbound_receives_shipment_unique
  on public.inbound_receives (shipment_id)
  where shipment_id is not null;

create index inbound_receives_po_idx on public.inbound_receives (po_id);
create index inbound_receives_date_idx on public.inbound_receives (receive_date);

create table public.inbound_receive_items (
  id uuid primary key default gen_random_uuid(),
  inbound_receive_id uuid not null references public.inbound_receives (id) on delete cascade,
  po_line_id uuid references public.purchase_order_lines (id) on delete set null,
  sku_id uuid references public.skus (id) on delete set null,
  ordered_qty numeric(14, 4) not null default 0,
  received_qty numeric(14, 4) not null default 0,
  discrepancy numeric(14, 4) not null default 0
);

create index inbound_receive_items_receive_idx on public.inbound_receive_items (inbound_receive_id);

-- RLS mirrors procurement tables (admin client bypasses; authenticated users can read/write).
alter table public.shipments enable row level security;
alter table public.shipment_purchase_orders enable row level security;
alter table public.shipment_items enable row level security;
alter table public.inbound_receives enable row level security;
alter table public.inbound_receive_items enable row level security;

create policy "authenticated read shipments" on public.shipments
  for select to authenticated using (true);
create policy "authenticated write shipments" on public.shipments
  for all to authenticated using (true) with check (true);

create policy "authenticated read shipment_purchase_orders" on public.shipment_purchase_orders
  for select to authenticated using (true);
create policy "authenticated write shipment_purchase_orders" on public.shipment_purchase_orders
  for all to authenticated using (true) with check (true);

create policy "authenticated read shipment_items" on public.shipment_items
  for select to authenticated using (true);
create policy "authenticated write shipment_items" on public.shipment_items
  for all to authenticated using (true) with check (true);

create policy "authenticated read inbound_receives" on public.inbound_receives
  for select to authenticated using (true);
create policy "authenticated write inbound_receives" on public.inbound_receives
  for all to authenticated using (true) with check (true);

create policy "authenticated read inbound_receive_items" on public.inbound_receive_items
  for select to authenticated using (true);
create policy "authenticated write inbound_receive_items" on public.inbound_receive_items
  for all to authenticated using (true) with check (true);
