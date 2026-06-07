-- FTI Supply Chain: procurement / restock workflow
-- Suppliers, purchase orders, order lines, partial receipts, and on-order rollup.
-- Receiving updates stock_levels (the snapshot the forecast reads) so received
-- stock flows back into demand planning automatically.

create type public.po_status as enum (
  'planned',
  'ordered',
  'in_transit',
  'received',
  'cancelled'
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  lead_time_days integer not null default 90 check (lead_time_days >= 0),
  contact text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid references public.suppliers (id) on delete set null,
  status public.po_status not null default 'planned',
  order_date date,
  expected_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_orders_status_idx on public.purchase_orders (status);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete restrict,
  qty_ordered numeric(14, 4) not null check (qty_ordered > 0),
  qty_received numeric(14, 4) not null default 0 check (qty_received >= 0),
  unit_cost numeric(14, 2),
  created_at timestamptz not null default now()
);

create index purchase_order_lines_po_idx on public.purchase_order_lines (po_id);
create index purchase_order_lines_sku_idx on public.purchase_order_lines (sku_id);

create table public.po_receipts (
  id uuid primary key default gen_random_uuid(),
  po_line_id uuid not null references public.purchase_order_lines (id) on delete cascade,
  qty_received numeric(14, 4) not null check (qty_received > 0),
  received_date date not null default current_date,
  location text not null default 'Gudang Finished Goods',
  created_at timestamptz not null default now()
);

create index po_receipts_line_idx on public.po_receipts (po_line_id);

-- Open on-order quantity per SKU: ordered/in-transit POs not yet fully received.
-- Used by the forecast to avoid re-recommending restocks already on order.
create or replace function public.get_on_order_qty_by_sku()
returns table (
  sku_id uuid,
  sku_code text,
  on_order_qty numeric
)
language sql
stable
as $$
  select
    pol.sku_id,
    s.sku_code,
    sum(pol.qty_ordered - pol.qty_received) as on_order_qty
  from public.purchase_order_lines pol
  join public.purchase_orders po on po.id = pol.po_id
  join public.skus s on s.id = pol.sku_id
  where po.status in ('ordered', 'in_transit')
    and pol.qty_ordered > pol.qty_received
  group by pol.sku_id, s.sku_code
  having sum(pol.qty_ordered - pol.qty_received) > 0;
$$;

-- Record a (partial) receipt for a PO line, increment received qty, fold the
-- received units into the latest stock snapshot the forecast reads, and
-- auto-complete the PO when every line is fully received.
create or replace function public.receive_po_line(
  p_po_line_id uuid,
  p_qty numeric,
  p_received_date date default current_date,
  p_location text default 'Gudang Finished Goods'
)
returns void
language plpgsql
as $$
declare
  v_sku_id uuid;
  v_po_id uuid;
  v_remaining numeric;
  v_target_date date;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Receipt quantity must be positive';
  end if;

  select sku_id, po_id, qty_ordered - qty_received
    into v_sku_id, v_po_id, v_remaining
  from public.purchase_order_lines
  where id = p_po_line_id
  for update;

  if v_sku_id is null then
    raise exception 'PO line % not found', p_po_line_id;
  end if;

  insert into public.po_receipts (po_line_id, qty_received, received_date, location)
  values (p_po_line_id, p_qty, p_received_date, p_location);

  update public.purchase_order_lines
  set qty_received = qty_received + p_qty
  where id = p_po_line_id;

  -- Add to the snapshot the forecast reads so the max(as_of_date) does not move
  -- (which would otherwise zero out every other SKU's stock for that date).
  select max(as_of_date)
    into v_target_date
  from public.stock_levels
  where location in ('Gudang Finished Goods', 'Gudang Inventory');

  if v_target_date is null then
    v_target_date := p_received_date;
  end if;

  insert into public.stock_levels (sku_id, location, qty_on_hand, as_of_date)
  values (v_sku_id, p_location, p_qty, v_target_date)
  on conflict (sku_id, location, as_of_date)
  do update set qty_on_hand = public.stock_levels.qty_on_hand + excluded.qty_on_hand;

  update public.purchase_orders po
  set status = 'received', updated_at = now()
  where po.id = v_po_id
    and po.status <> 'cancelled'
    and not exists (
      select 1
      from public.purchase_order_lines l
      where l.po_id = po.id
        and l.qty_received < l.qty_ordered
    );
end;
$$;

-- RLS: authenticated team access (mirrors existing tables)
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.po_receipts enable row level security;

create policy "authenticated read suppliers" on public.suppliers
  for select to authenticated using (true);
create policy "authenticated write suppliers" on public.suppliers
  for all to authenticated using (true) with check (true);

create policy "authenticated read purchase_orders" on public.purchase_orders
  for select to authenticated using (true);
create policy "authenticated write purchase_orders" on public.purchase_orders
  for all to authenticated using (true) with check (true);

create policy "authenticated read purchase_order_lines" on public.purchase_order_lines
  for select to authenticated using (true);
create policy "authenticated write purchase_order_lines" on public.purchase_order_lines
  for all to authenticated using (true) with check (true);

create policy "authenticated read po_receipts" on public.po_receipts
  for select to authenticated using (true);
create policy "authenticated write po_receipts" on public.po_receipts
  for all to authenticated using (true) with check (true);
