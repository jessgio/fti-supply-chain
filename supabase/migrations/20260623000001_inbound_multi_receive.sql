-- Allow multiple inbound receives per shipment (partial receive completion).
drop index if exists public.inbound_receives_shipment_unique;

create index if not exists inbound_receives_shipment_idx
  on public.inbound_receives (shipment_id);

create index if not exists shipment_purchase_orders_shipment_idx
  on public.shipment_purchase_orders (shipment_id);

create index if not exists shipment_items_shipment_idx
  on public.shipment_items (shipment_id);
