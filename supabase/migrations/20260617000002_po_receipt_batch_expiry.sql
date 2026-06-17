-- Optional batch code and expiry date on PO receipts for incoming stock tracking.

alter table public.po_receipts
  add column batch_code text,
  add column expiry_date date;

create index po_receipts_batch_code_idx on public.po_receipts (batch_code)
  where batch_code is not null;

create index po_receipts_expiry_date_idx on public.po_receipts (expiry_date)
  where expiry_date is not null;

create or replace function public.receive_po_line(
  p_po_line_id uuid,
  p_qty numeric,
  p_received_date date default current_date,
  p_location text default 'Gudang Finished Goods',
  p_batch_code text default null,
  p_expiry_date date default null
)
returns void
language plpgsql
as $$
declare
  v_sku_id uuid;
  v_po_id uuid;
  v_remaining numeric;
  v_target_date date;
  v_batch_code text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Receipt quantity must be positive';
  end if;

  v_batch_code := nullif(trim(p_batch_code), '');

  select sku_id, po_id, qty_ordered - qty_received
    into v_sku_id, v_po_id, v_remaining
  from public.purchase_order_lines
  where id = p_po_line_id
  for update;

  if v_sku_id is null then
    raise exception 'PO line % not found', p_po_line_id;
  end if;

  insert into public.po_receipts (
    po_line_id,
    qty_received,
    received_date,
    location,
    batch_code,
    expiry_date
  )
  values (
    p_po_line_id,
    p_qty,
    p_received_date,
    p_location,
    v_batch_code,
    p_expiry_date
  );

  update public.purchase_order_lines
  set qty_received = qty_received + p_qty
  where id = p_po_line_id;

  select max(as_of_date)
    into v_target_date
  from public.stock_levels
  where location in (
    'Gudang Finished Goods',
    'Gudang Inventory',
    'Gudang Inventory Offline'
  );

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
