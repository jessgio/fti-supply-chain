-- Set purchase_orders.expected_date and the shipment departures that follow
-- it in one transaction. planExpectedDateShipmentShifts decides which
-- shipments move. This function aborts the whole update if the purchase
-- order date, or a shipment's departure or status, no longer matches that
-- snapshot. Transit days and delay days stay as they are, and the stored
-- ETA is departure + transit + delay.

create or replace function public.apply_po_expected_date_and_shipment_shifts(
  p_po_id uuid,
  p_expected_date date,
  p_previous_expected_date date,
  p_shifts jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected date;
  v_item jsonb;
  v_id uuid;
  v_seen uuid[] := array[]::uuid[];
  v_ship public.shipments%rowtype;
  v_new_departure date;
  v_new_status public.shipment_status;
  v_from_departure date;
begin
  if p_shifts is not null and jsonb_typeof(p_shifts) <> 'array' then
    raise exception 'Shipment shifts must be a JSON array.';
  end if;

  select expected_date
  into v_expected
  from public.purchase_orders
  where id = p_po_id
  for update;

  if not found then
    raise exception 'Purchase order not found.';
  end if;

  if v_expected is distinct from p_previous_expected_date then
    raise exception 'This expected date was updated somewhere else. Refresh and try again.';
  end if;

  update public.purchase_orders
  set expected_date = p_expected_date,
      updated_at = now()
  where id = p_po_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb))
    order by value->>'id'
  loop
    v_id := (v_item->>'id')::uuid;
    if v_id is null then
      raise exception 'Shipment shift is missing an id.';
    end if;
    if v_id = any(v_seen) then
      raise exception 'Duplicate shipment shift.';
    end if;
    v_seen := array_append(v_seen, v_id);

    select *
    into v_ship
    from public.shipments
    where id = v_id
    for update;

    if not found then
      raise exception 'Shipment not found.';
    end if;

    if not exists (
      select 1
      from public.shipment_purchase_orders
      where shipment_id = v_id
        and po_id = p_po_id
    ) then
      raise exception 'Shipment % is not linked to this purchase order.', v_ship.shipment_number;
    end if;

    if v_ship.status <> 'planned' then
      raise exception 'Shipment % can no longer move with the production date. Refresh and try again.', v_ship.shipment_number;
    end if;

    if v_ship.status::text is distinct from v_item->>'from_status' then
      raise exception 'Shipment % changed while saving. Refresh and try again.', v_ship.shipment_number;
    end if;

    v_from_departure := (v_item->>'from_departure')::date;
    if v_ship.estimated_departure_date is distinct from v_from_departure then
      raise exception 'Shipment % changed while saving. Refresh and try again.', v_ship.shipment_number;
    end if;

    v_new_departure := (v_item->>'estimated_departure_date')::date;
    if v_new_departure is null then
      raise exception 'Shipment departure date is required.';
    end if;

    v_new_status := (v_item->>'status')::public.shipment_status;
    if v_new_status::text not in ('planned', 'in_transit') then
      raise exception 'Shipment % cannot move to status %.', v_ship.shipment_number, v_new_status;
    end if;

    update public.shipments
    set estimated_departure_date = v_new_departure,
        expected_delivery_date = v_new_departure + v_ship.transit_days + v_ship.delay_days,
        status = v_new_status,
        updated_at = now()
    where id = v_ship.id;
  end loop;

  return jsonb_build_object(
    'shipments',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'shipment_number', s.shipment_number,
          'shipment_type', s.shipment_type,
          'status', s.status,
          'estimated_departure_date', s.estimated_departure_date,
          'expected_delivery_date', s.expected_delivery_date,
          'transit_days', s.transit_days,
          'delay_days', s.delay_days
        )
        order by s.estimated_departure_date, s.shipment_number
      )
      from public.shipments s
      join public.shipment_purchase_orders spo on spo.shipment_id = s.id
      where spo.po_id = p_po_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.apply_po_expected_date_and_shipment_shifts(uuid, date, date, jsonb) is
  'Sets purchase_orders.expected_date and shifts the supplied planned shipments in one transaction.';

revoke all on function public.apply_po_expected_date_and_shipment_shifts(uuid, date, date, jsonb) from public;
revoke all on function public.apply_po_expected_date_and_shipment_shifts(uuid, date, date, jsonb) from anon;
grant execute on function public.apply_po_expected_date_and_shipment_shifts(uuid, date, date, jsonb)
  to authenticated, service_role;
