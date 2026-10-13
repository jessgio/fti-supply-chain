-- A committed down payment should exist only after a payment is logged.
-- Freezes written for an AP filing, or left behind after the payment or AP
-- link was removed, were keeping a stale amount. The invoice summary then
-- showed that amount as a percentage of the current total (for example 52.7%)
-- instead of the PO's down payment percentage.

update public.purchase_orders po
set
  committed_invoice_total = null,
  committed_down_payment = null,
  committed_balance = null,
  payment_amounts_committed_at = null
where not exists (
  select 1
  from public.po_payments p
  where p.po_id = po.id
)
and (
  po.committed_invoice_total is not null
  or po.committed_down_payment is not null
  or po.committed_balance is not null
  or po.payment_amounts_committed_at is not null
);

comment on column public.purchase_orders.committed_down_payment is
  'Down-payment amount locked when a payment is logged. Ignored while the PO has no payments; the invoice summary then follows down_payment_pct.';
comment on column public.purchase_orders.committed_balance is
  'Balance amount stored alongside a logged payment. The invoice summary balance is the live invoice total minus the locked down payment.';
comment on column public.purchase_orders.committed_invoice_total is
  'Invoice total stored when a payment was logged. The invoice summary total always follows live lines and charges.';
comment on column public.purchase_orders.payment_amounts_committed_at is
  'When the payment schedule was locked by a logged payment.';
