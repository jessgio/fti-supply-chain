-- Keep fractional payment amounts. Percentage splits (for example 50% of an
-- odd invoice) are exact decimals on the supplier invoice, and customs checks
-- payment history against that invoice. numeric(14, 2) already stored cents,
-- but the previous whole-unit rounding discarded them before insert. These
-- columns now keep the same 12 digits before the decimal and 10 after, which
-- matches the stated payment precision in the app.

alter table public.po_payments
  alter column amount type numeric(22, 10);

alter table public.purchase_orders
  alter column committed_invoice_total type numeric(22, 10),
  alter column committed_down_payment type numeric(22, 10),
  alter column committed_balance type numeric(22, 10);

alter table public.purchase_order_lark_submissions
  alter column submitted_amount type numeric(22, 10);
