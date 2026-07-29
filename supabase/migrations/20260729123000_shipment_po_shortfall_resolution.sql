-- Persist ship-time shortfall intent so leave_as_is can be applied after inbound
-- closes the shipment (cannot close_po_line before any receipt).

alter table public.shipments
  add column if not exists po_shortfall_resolution text
    check (
      po_shortfall_resolution is null
      or po_shortfall_resolution in ('leave_as_is', 'adjust_ordered')
    );

comment on column public.shipments.po_shortfall_resolution is
  'When set at short-ship: leave_as_is applied when inbound closes shipment; adjust_ordered applied immediately at ship save.';
