-- Allow up to 5 decimal places on PO line unit costs.
alter table public.purchase_order_lines
  alter column unit_cost type numeric(14, 5);
