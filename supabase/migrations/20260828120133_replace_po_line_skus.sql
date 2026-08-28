-- Replace placeholder SKUs on PO lines after the official SKU exists.
-- Cascades to inbound receive items, production reports, PO-scoped notes,
-- and moves this PO's received stock from the old SKU to the new one.

alter table public.purchase_order_lines
  add column if not exists original_sku_id uuid
    references public.skus (id) on delete set null;

comment on column public.purchase_order_lines.original_sku_id is
  'First SKU on this line before any official-SKU replacement. Null if never replaced.';

create index if not exists purchase_order_lines_original_sku_idx
  on public.purchase_order_lines (original_sku_id)
  where original_sku_id is not null;

create table if not exists public.po_line_sku_replacements (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  po_line_id uuid not null references public.purchase_order_lines (id) on delete cascade,
  from_sku_id uuid not null references public.skus (id) on delete restrict,
  to_sku_id uuid not null references public.skus (id) on delete restrict,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint po_line_sku_replacements_different check (from_sku_id <> to_sku_id)
);

create index if not exists po_line_sku_replacements_po_idx
  on public.po_line_sku_replacements (po_id, created_at desc);

create index if not exists po_line_sku_replacements_line_idx
  on public.po_line_sku_replacements (po_line_id, created_at desc);

alter table public.po_line_sku_replacements enable row level security;

drop policy if exists "authenticated read po_line_sku_replacements"
  on public.po_line_sku_replacements;
create policy "authenticated read po_line_sku_replacements"
  on public.po_line_sku_replacements for select
  to authenticated
  using (true);

drop policy if exists "writer write po_line_sku_replacements"
  on public.po_line_sku_replacements;
create policy "writer write po_line_sku_replacements"
  on public.po_line_sku_replacements for all
  to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

create or replace function public.replace_po_line_skus(
  p_po_id uuid,
  p_replacements jsonb,
  p_changed_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_item record;
  v_line public.purchase_order_lines%rowtype;
  v_new_sku public.skus%rowtype;
  v_receipt record;
  v_target_date date;
  v_inbound_count integer;
  v_production_count integer;
  v_notes_count integer;
  v_receipt_qty numeric;
  v_seen uuid[] := array[]::uuid[];
  v_replaced jsonb := '[]'::jsonb;
begin
  if p_replacements is null or jsonb_typeof(p_replacements) <> 'array' then
    raise exception 'Replacements must be a JSON array';
  end if;

  if jsonb_array_length(p_replacements) = 0 then
    raise exception 'Select at least one line to replace';
  end if;

  select *
    into v_po
  from public.purchase_orders
  where id = p_po_id
  for update;

  if v_po.id is null then
    raise exception 'Purchase order % not found', p_po_id;
  end if;

  select max(as_of_date)
    into v_target_date
  from public.stock_levels
  where location in (
    'Gudang Finished Goods',
    'Gudang Inventory',
    'Gudang Inventory Offline'
  );

  for v_item in
    select *
    from jsonb_to_recordset(p_replacements) as x(po_line_id uuid, new_sku_id uuid)
  loop
    if v_item.po_line_id is null or v_item.new_sku_id is null then
      raise exception 'Each replacement needs po_line_id and new_sku_id';
    end if;

    if v_item.po_line_id = any (v_seen) then
      raise exception 'Duplicate replacement for PO line %', v_item.po_line_id;
    end if;
    v_seen := array_append(v_seen, v_item.po_line_id);

    select *
      into v_line
    from public.purchase_order_lines
    where id = v_item.po_line_id
    for update;

    if v_line.id is null then
      raise exception 'PO line % not found', v_item.po_line_id;
    end if;

    if v_line.po_id <> p_po_id then
      raise exception 'PO line % does not belong to this purchase order', v_item.po_line_id;
    end if;

    if v_line.sku_id = v_item.new_sku_id then
      continue;
    end if;

    select *
      into v_new_sku
    from public.skus
    where id = v_item.new_sku_id;

    if v_new_sku.id is null then
      raise exception 'SKU % not found', v_item.new_sku_id;
    end if;

    update public.purchase_order_lines
    set
      original_sku_id = coalesce(original_sku_id, sku_id),
      sku_id = v_item.new_sku_id
    where id = v_line.id;

    update public.inbound_receive_items
    set sku_id = v_item.new_sku_id
    where po_line_id = v_line.id
      and sku_id is not distinct from v_line.sku_id;
    get diagnostics v_inbound_count = row_count;

    update public.manufacturer_production_report_lines
    set sku_id = v_item.new_sku_id
    where po_line_id = v_line.id
      and sku_id = v_line.sku_id;
    get diagnostics v_production_count = row_count;

    update public.status_updates su
    set sku_id = v_item.new_sku_id
    where su.sku_id = v_line.sku_id
      and (
        (su.entity_type = 'po' and su.entity_id = p_po_id)
        or (
          su.entity_type = 'inbound'
          and su.entity_id in (
            select ir.id
            from public.inbound_receives ir
            where ir.po_id = p_po_id
          )
        )
      );
    get diagnostics v_notes_count = row_count;

    update public.status_update_skus sus
    set sku_id = v_item.new_sku_id
    from public.status_updates su
    where sus.status_update_id = su.id
      and sus.sku_id = v_line.sku_id
      and (
        (su.entity_type = 'po' and su.entity_id = p_po_id)
        or (
          su.entity_type = 'inbound'
          and su.entity_id in (
            select ir.id
            from public.inbound_receives ir
            where ir.po_id = p_po_id
          )
        )
      )
      and not exists (
        select 1
        from public.status_update_skus other
        where other.status_update_id = sus.status_update_id
          and other.sku_id = v_item.new_sku_id
      );

    delete from public.status_update_skus sus
    using public.status_updates su
    where sus.status_update_id = su.id
      and sus.sku_id = v_line.sku_id
      and (
        (su.entity_type = 'po' and su.entity_id = p_po_id)
        or (
          su.entity_type = 'inbound'
          and su.entity_id in (
            select ir.id
            from public.inbound_receives ir
            where ir.po_id = p_po_id
          )
        )
      );

    v_receipt_qty := 0;
    for v_receipt in
      select *
      from public.po_receipts
      where po_line_id = v_line.id
      for update
    loop
      v_receipt_qty := v_receipt_qty + v_receipt.qty_received;

      if v_target_date is null then
        v_target_date := v_receipt.received_date;
      end if;

      insert into public.stock_levels (sku_id, location, qty_on_hand, as_of_date)
      values (
        v_line.sku_id,
        v_receipt.location,
        -v_receipt.qty_received,
        v_target_date
      )
      on conflict (sku_id, location, as_of_date)
      do update set qty_on_hand =
        public.stock_levels.qty_on_hand + excluded.qty_on_hand;

      insert into public.stock_levels (sku_id, location, qty_on_hand, as_of_date)
      values (
        v_item.new_sku_id,
        v_receipt.location,
        v_receipt.qty_received,
        v_target_date
      )
      on conflict (sku_id, location, as_of_date)
      do update set qty_on_hand =
        public.stock_levels.qty_on_hand + excluded.qty_on_hand;
    end loop;

    insert into public.po_line_sku_replacements (
      po_id,
      po_line_id,
      from_sku_id,
      to_sku_id,
      changed_by
    )
    values (
      p_po_id,
      v_line.id,
      v_line.sku_id,
      v_item.new_sku_id,
      p_changed_by
    );

    v_replaced := v_replaced || jsonb_build_array(jsonb_build_object(
      'po_line_id', v_line.id,
      'from_sku_id', v_line.sku_id,
      'to_sku_id', v_item.new_sku_id,
      'inbound_items', coalesce(v_inbound_count, 0),
      'production_lines', coalesce(v_production_count, 0),
      'status_notes', coalesce(v_notes_count, 0),
      'receipt_qty_moved', coalesce(v_receipt_qty, 0)
    ));
  end loop;

  if jsonb_array_length(v_replaced) = 0 then
    raise exception 'No SKU changes to apply. Pick a different SKU for at least one line.';
  end if;

  update public.purchase_orders
  set updated_at = now()
  where id = p_po_id;

  return jsonb_build_object('replaced', v_replaced);
end;
$$;

comment on function public.replace_po_line_skus(uuid, jsonb, uuid) is
  'Atomically replace SKUs on PO lines and cascade to inbound, production reports, notes, and received stock.';

revoke all on function public.replace_po_line_skus(uuid, jsonb, uuid) from public;
revoke all on function public.replace_po_line_skus(uuid, jsonb, uuid) from anon;
grant execute on function public.replace_po_line_skus(uuid, jsonb, uuid)
  to authenticated, service_role;
