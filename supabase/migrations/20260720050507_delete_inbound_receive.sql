-- Link receipts to inbound receives and allow deleting a receive (reverses stock + PO qty).

alter table public.po_receipts
  add column if not exists inbound_receive_id uuid
    references public.inbound_receives (id) on delete set null;

create index if not exists po_receipts_inbound_receive_idx
  on public.po_receipts (inbound_receive_id)
  where inbound_receive_id is not null;

-- Replace overloaded receive_po_line signatures with a single definition.
drop function if exists public.receive_po_line(uuid, numeric, date, text);
drop function if exists public.receive_po_line(uuid, numeric, date, text, text, date);
drop function if exists public.receive_po_line(uuid, numeric, date, text, text, date, boolean);

create or replace function public.receive_po_line(
  p_po_line_id uuid,
  p_qty numeric,
  p_received_date date default current_date,
  p_location text default 'Gudang Finished Goods',
  p_batch_code text default null,
  p_expiry_date date default null,
  p_close_line boolean default false,
  p_inbound_receive_id uuid default null
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
    expiry_date,
    inbound_receive_id
  )
  values (
    p_po_line_id,
    p_qty,
    p_received_date,
    p_location,
    v_batch_code,
    p_expiry_date,
    p_inbound_receive_id
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

create or replace function public.delete_inbound_receive(p_id uuid)
returns void
language plpgsql
as $$
declare
  v_receive public.inbound_receives%rowtype;
  v_item record;
  v_receipt record;
  v_needed numeric;
  v_selected uuid[] := array[]::uuid[];
  v_sku_id uuid;
  v_target_date date;
  v_new_qty numeric;
begin
  select *
    into v_receive
  from public.inbound_receives
  where id = p_id
  for update;

  if v_receive.id is null then
    raise exception 'Inbound receive % not found', p_id;
  end if;

  for v_item in
    select *
    from public.inbound_receive_items
    where inbound_receive_id = p_id
      and received_qty > 0
  loop
    v_needed := v_item.received_qty;
    v_selected := array[]::uuid[];

    -- Prefer receipts explicitly linked to this receive.
    for v_receipt in
      select *
      from public.po_receipts
      where inbound_receive_id = p_id
        and po_line_id = v_item.po_line_id
      order by created_at desc, id desc
      for update
    loop
      exit when v_needed <= 0;
      if v_receipt.qty_received <= v_needed then
        v_selected := array_append(v_selected, v_receipt.id);
        v_needed := v_needed - v_receipt.qty_received;
      end if;
    end loop;

    -- Fallback for legacy receipts created before inbound_receive_id existed.
    if v_needed > 0 then
      for v_receipt in
        select *
        from public.po_receipts
        where inbound_receive_id is null
          and po_line_id = v_item.po_line_id
          and received_date = v_receive.receive_date
          and not (id = any (v_selected))
        order by created_at desc, id desc
        for update
      loop
        exit when v_needed <= 0;
        if v_receipt.qty_received <= v_needed then
          v_selected := array_append(v_selected, v_receipt.id);
          v_needed := v_needed - v_receipt.qty_received;
        end if;
      end loop;
    end if;

    if v_needed <> 0 then
      raise exception
        'Could not match PO receipts to reverse for inbound line % (short by %)',
        v_item.po_line_id,
        v_needed;
    end if;

    select sku_id into v_sku_id
    from public.purchase_order_lines
    where id = v_item.po_line_id
    for update;

    for v_receipt in
      select *
      from public.po_receipts
      where id = any (v_selected)
    loop
      select max(as_of_date)
        into v_target_date
      from public.stock_levels
      where location in (
        'Gudang Finished Goods',
        'Gudang Inventory',
        'Gudang Inventory Offline'
      );

      if v_target_date is null then
        v_target_date := v_receipt.received_date;
      end if;

      insert into public.stock_levels (sku_id, location, qty_on_hand, as_of_date)
      values (v_sku_id, v_receipt.location, -v_receipt.qty_received, v_target_date)
      on conflict (sku_id, location, as_of_date)
      do update set qty_on_hand = public.stock_levels.qty_on_hand + excluded.qty_on_hand;

      delete from public.po_receipts where id = v_receipt.id;
    end loop;

    update public.purchase_order_lines
    set
      qty_received = qty_received - v_item.received_qty,
      is_closed = case
        when qty_received - v_item.received_qty >= qty_ordered then true
        else false
      end
    where id = v_item.po_line_id
    returning qty_received into v_new_qty;

    if v_new_qty < 0 then
      raise exception
        'Reversing inbound receive would make qty_received negative for line %',
        v_item.po_line_id;
    end if;
  end loop;

  delete from public.inbound_receives where id = p_id;
end;
$$;
