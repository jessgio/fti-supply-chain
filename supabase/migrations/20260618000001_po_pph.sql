-- Configurable PPh (withholding tax) on purchase orders.
-- Calculated on pre-VAT amount and deducted from the invoice total.

alter table public.purchase_orders
  add column pph_pct numeric(5, 2) not null default 0
    check (pph_pct >= 0 and pph_pct <= 100);
