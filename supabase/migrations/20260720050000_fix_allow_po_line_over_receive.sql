-- Re-apply over-receive: prior migration was recorded but function body was not updated.

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
  v_line public.purchase_order_lines%rowtype;
  v_target_date date;
  v_batch_code text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Receipt quantity must be positive';
  end if;

  v_batch_code := nullif(trim(p_batch_code), '');

  select *
    into v_line
  from public.purchase_order_lines
  where id = p_po_line_id
  for update;

  if v_line.id is null then
    raise exception 'PO line % not found', p_po_line_id;
  end if;

  -- Short-closed lines cannot receive more; fully received lines may take overage.
  if v_line.is_closed and v_line.qty_received < v_line.qty_ordered then
    raise exception 'PO line % is already closed', p_po_line_id;
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
  values (v_line.sku_id, p_location, p_qty, v_target_date)
  on conflict (sku_id, location, as_of_date)
  do update set qty_on_hand = public.stock_levels.qty_on_hand + excluded.qty_on_hand;

  perform public.complete_po_if_lines_done(v_line.po_id);
end;
$$;
