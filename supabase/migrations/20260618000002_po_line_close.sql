-- Allow closing PO lines short (received less than ordered) without waiting for remainder.

alter table public.purchase_order_lines
  add column is_closed boolean not null default false;

create index purchase_order_lines_closed_idx
  on public.purchase_order_lines (po_id)
  where is_closed = false;

create or replace function public.complete_po_if_lines_done(p_po_id uuid)
returns void
language plpgsql
as $$
begin
  update public.purchase_orders po
  set status = 'received', updated_at = now()
  where po.id = p_po_id
    and po.status not in ('received', 'cancelled')
    and not exists (
      select 1
      from public.purchase_order_lines l
      where l.po_id = po.id
        and l.is_closed = false
        and l.qty_received < l.qty_ordered
    );
end;
$$;

create or replace function public.close_po_line(p_po_line_id uuid)
returns void
language plpgsql
as $$
declare
  v_po_id uuid;
  v_line public.purchase_order_lines%rowtype;
begin
  select * into v_line
  from public.purchase_order_lines
  where id = p_po_line_id
  for update;

  if v_line.id is null then
    raise exception 'PO line % not found', p_po_line_id;
  end if;

  if v_line.is_closed then
    raise exception 'PO line % is already closed', p_po_line_id;
  end if;

  if v_line.qty_received >= v_line.qty_ordered then
    raise exception 'PO line % is already fully received', p_po_line_id;
  end if;

  update public.purchase_order_lines
  set is_closed = true
  where id = p_po_line_id;

  perform public.complete_po_if_lines_done(v_line.po_id);
end;
$$;

create or replace function public.receive_po_line(
  p_po_line_id uuid,
  p_qty numeric,
  p_received_date date default current_date,
  p_location text default 'Gudang Finished Goods',
  p_batch_code text default null,
  p_expiry_date date default null,
  p_close_line boolean default false
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
    and is_closed = false
  for update;

  if v_sku_id is null then
    raise exception 'PO line % not found or already closed', p_po_line_id;
  end if;

  if p_qty > v_remaining then
    raise exception 'Receipt quantity % exceeds remaining %', p_qty, v_remaining;
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
  set
    qty_received = qty_received + p_qty,
    is_closed = is_closed or p_close_line
      or (qty_received + p_qty >= qty_ordered)
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

  perform public.complete_po_if_lines_done(v_po_id);
end;
$$;

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
    and pol.is_closed = false
    and pol.qty_ordered > pol.qty_received
  group by pol.sku_id, s.sku_code
  having sum(pol.qty_ordered - pol.qty_received) > 0;
$$;
