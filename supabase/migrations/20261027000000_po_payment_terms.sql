-- Some suppliers bill a purchase order in more than a down payment and a
-- final payment. payment_terms stores that schedule. Null keeps the existing
-- two-part split from down_payment_pct.

alter table public.purchase_orders
  add column if not exists payment_terms jsonb,
  add column if not exists committed_payment_terms jsonb;

comment on column public.purchase_orders.payment_terms is
  'Ordered installments [{label, pct}] totaling 100. Null uses down_payment_pct as the down payment and the remainder as the final payment.';

comment on column public.purchase_orders.committed_payment_terms is
  'Installment amounts [{label, amount}] locked when a payment is logged. Ignored while the PO has no payments. The last installment is recomputed from the live invoice.';
