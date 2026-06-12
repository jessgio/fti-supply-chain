-- Vendor discount and tax on purchase orders

alter table public.purchase_orders
  add column discount_amount numeric(14, 2) not null default 0
    check (discount_amount >= 0);
