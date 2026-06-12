-- Configurable tax rate and other invoice charges on purchase orders

alter table public.purchase_orders
  add column tax_pct numeric(5, 2) not null default 11
    check (tax_pct >= 0 and tax_pct <= 100),
  add column other_charges numeric(14, 2) not null default 0
    check (other_charges >= 0);
