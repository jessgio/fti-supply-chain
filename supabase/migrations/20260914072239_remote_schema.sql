drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.close_po_line(p_po_line_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_po_if_lines_done(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_inbound_receive(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_extract_summaries()
 RETURNS TABLE(extract_id uuid, txn_count bigint, first_date date, last_date date, starting_balance numeric, ending_balance numeric, total_received numeric, total_issued numeric, waste_issued numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with ordered as (
    select
      t.extract_id,
      t.txn_date,
      t.seq,
      t.received,
      t.issued,
      t.balance,
      t.category,
      row_number() over (
        partition by t.extract_id
        order by t.txn_date, t.seq
      ) as rn_first
    from public.extract_transactions t
  ),
  agg as (
    select
      extract_id,
      count(*)::bigint as txn_count,
      min(txn_date) as first_date,
      max(txn_date) as last_date,
      coalesce(sum(received), 0) as total_received,
      coalesce(sum(issued), 0) as total_issued,
      coalesce(
        sum(case when category = 'waste'::public.extract_category then issued else 0 end),
        0
      ) as waste_issued
    from public.extract_transactions
    group by extract_id
  ),
  first_row as (
    select extract_id, balance, received, issued
    from ordered
    where rn_first = 1
  ),
  last_balance as (
    select distinct on (extract_id)
      extract_id,
      balance
    from ordered
    where balance is not null
    order by extract_id, txn_date desc, seq desc
  )
  select
    a.extract_id,
    a.txn_count,
    a.first_date,
    a.last_date,
    case
      when f.balance is not null then f.balance - f.received + f.issued
      else 0::numeric
    end as starting_balance,
    coalesce(l.balance, case
      when f.balance is not null then f.balance - f.received + f.issued
      else 0::numeric
    end) as ending_balance,
    a.total_received,
    a.total_issued,
    a.waste_issued
  from agg a
  left join first_row f on f.extract_id = a.extract_id
  left join last_balance l on l.extract_id = a.extract_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_npd_stock_skus()
 RETURNS TABLE(sku_code text, sku_name text, franchise_name text, qty_on_hand numeric, stock_as_of date)
 LANGUAGE sql
 STABLE
AS $function$
  with latest_stock_date as (
    select coalesce(max(sl.as_of_date), current_date) as d
    from public.stock_levels sl
    where sl.location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
  ),
  stock_by_sku as (
    select
      sl.sku_id,
      coalesce(sum(sl.qty_on_hand), 0) as qty_on_hand
    from public.stock_levels sl
    cross join latest_stock_date lsd
    where sl.as_of_date = lsd.d
      and sl.location in (
        'Gudang Finished Goods',
        'Gudang Inventory',
        'Gudang Inventory Offline'
      )
    group by sl.sku_id
    having coalesce(sum(sl.qty_on_hand), 0) > 0
  ),
  open_po_skus as (
    select distinct pol.sku_id
    from public.purchase_order_lines pol
    join public.purchase_orders po on po.id = pol.po_id
    where po.status in ('planned', 'ordered', 'in_production', 'in_transit')
      and (pol.qty_ordered - pol.qty_received) > 0
  ),
  candidate_ids as (
    select sku_id from stock_by_sku
    union
    select sku_id from open_po_skus
  )
  select
    s.sku_code,
    s.name as sku_name,
    pf.name as franchise_name,
    coalesce(sbs.qty_on_hand, 0) as qty_on_hand,
    lsd.d as stock_as_of
  from candidate_ids c
  join public.skus s on s.id = c.sku_id
  cross join latest_stock_date lsd
  left join public.product_franchises pf on pf.id = s.franchise_id
  left join stock_by_sku sbs on sbs.sku_id = c.sku_id
  where s.is_bundle = false
    and s.is_packaging = false
    and s.is_extract = false
    and not exists (
      select 1 from public.sales_records sr where sr.sku_id = s.id
    )
    and not exists (
      select 1
      from public.sales_records sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      where bc.component_sku_id = s.id
    )
  order by qty_on_hand desc, s.sku_code;
$function$
;

CREATE OR REPLACE FUNCTION public.get_on_order_qty_by_sku()
 RETURNS TABLE(sku_id uuid, sku_code text, on_order_qty numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select
    pol.sku_id,
    s.sku_code,
    sum(pol.qty_ordered - pol.qty_received) as on_order_qty
  from public.purchase_order_lines pol
  join public.purchase_orders po on po.id = pol.po_id
  join public.skus s on s.id = pol.sku_id
  where po.status in ('planned', 'ordered', 'in_production', 'in_transit')
    and pol.is_closed = false
    and pol.qty_ordered > pol.qty_received
  group by pol.sku_id, s.sku_code
  having sum(pol.qty_ordered - pol.qty_received) > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sop_monthly_actuals(p_start date, p_end date)
 RETURNS TABLE(sku_id uuid, channel_id uuid, sale_year integer, sale_month integer, qty numeric, net_sales numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    sr.sku_id,
    sr.channel_id,
    extract(year from sr.sale_date)::integer as sale_year,
    extract(month from sr.sale_date)::integer as sale_month,
    sum(sr.qty_sold)::numeric as qty,
    sum(sr.net_sales)::numeric as net_sales
  from public.sales_records sr
  where sr.sale_date >= p_start
    and sr.sale_date <= p_end
  group by
    sr.sku_id,
    sr.channel_id,
    extract(year from sr.sale_date),
    extract(month from sr.sale_date);
$function$
;

CREATE OR REPLACE FUNCTION public.get_sop_monthly_actuals_json(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sku_id', t.sku_id,
        'channel_id', t.channel_id,
        'sale_year', t.sale_year,
        'sale_month', t.sale_month,
        'qty', t.qty,
        'net_sales', t.net_sales
      )
    ),
    '[]'::jsonb
  )
  from public.get_sop_monthly_actuals(p_start, p_end) t;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sop_stock_by_sku_json()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with latest as (
    select max(as_of_date) as as_of_date
    from public.stock_levels
    where location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('sku_id', s.sku_id, 'qty', s.qty)),
    '[]'::jsonb
  )
  from (
    select sl.sku_id, sum(sl.qty_on_hand)::numeric as qty
    from public.stock_levels sl
    join latest on sl.as_of_date = latest.as_of_date
    where sl.location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
    group by sl.sku_id
  ) s;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hook_restrict_signup_to_fti_domain(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  email text;
  domain text;
begin
  email := lower(trim(event->'user'->>'email'));
  domain := split_part(coalesce(email, ''), '@', 2);

  if domain is distinct from 'fromthisisland.com' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Only @fromthisisland.com Google accounts can sign in.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.receive_po_line(p_po_line_id uuid, p_qty numeric, p_received_date date DEFAULT CURRENT_DATE, p_location text DEFAULT 'Gudang Finished Goods'::text, p_batch_code text DEFAULT NULL::text, p_expiry_date date DEFAULT NULL::date, p_close_line boolean DEFAULT false, p_inbound_receive_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.replace_po_line_skus(p_po_id uuid, p_replacements jsonb, p_changed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sku_retail_price_as_of(p_sku_id uuid, p_on date)
 RETURNS numeric
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  select p.retail_price
  from public.sku_retail_prices p
  where p.sku_id = p_sku_id
    and p.effective_from <= p_on
  order by p.effective_from desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_sku_current_retail_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_sku_id uuid := coalesce(new.sku_id, old.sku_id);
begin
  update public.skus
  set retail_price = public.sku_retail_price_as_of(v_sku_id, current_date)
  where id = v_sku_id;
  return coalesce(new, old);
end;
$function$
;


