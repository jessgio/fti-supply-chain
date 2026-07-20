-- Allow deleting inbound receives that never applied stock (orphan header rows).

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
  v_original_needed numeric;
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
    v_original_needed := v_item.received_qty;
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

    -- Orphan receive: header/items exist but stock was never applied.
    if v_needed = v_original_needed then
      continue;
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
