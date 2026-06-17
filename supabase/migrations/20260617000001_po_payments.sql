-- Log multiple payments per purchase order (down payment, balance, shipping, fees, etc.)

create table public.po_payments (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  payment_request_number text not null,
  currency text not null default 'IDR',
  exchange_rate numeric(18, 6) check (exchange_rate is null or exchange_rate > 0),
  purpose text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index po_payments_po_idx on public.po_payments (po_id);
create index po_payments_date_idx on public.po_payments (payment_date desc);

alter table public.po_payments enable row level security;

create policy "authenticated read po_payments" on public.po_payments
  for select to authenticated using (true);

create policy "writer write po_payments" on public.po_payments
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
