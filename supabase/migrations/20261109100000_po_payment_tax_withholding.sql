-- Tax withheld from a supplier payment and paid to the government.
-- This is not a discount: the supplier receives `amount`, and `tax_withholding`
-- still settles the invoice. Logged payments plus withholding are compared
-- with the invoice total.

alter table public.po_payments
  add column tax_withholding numeric(22, 10) not null default 0
  check (tax_withholding >= 0);

comment on column public.po_payments.tax_withholding is
  'Amount withheld from the supplier and paid to the government, in the payment currency. Counts toward settling the invoice and is not a discount.';
