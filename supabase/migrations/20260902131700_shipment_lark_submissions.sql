-- Lark AP Form submissions for shipment tax invoices and shipping invoices.

create table if not exists public.shipment_lark_submissions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  invoice_kind text not null
    check (invoice_kind in ('tax', 'shipping')),
  supplier_id uuid references public.suppliers (id) on delete set null,
  lark_instance_code text not null,
  lark_serial_number text,
  lark_approval_status text,
  lark_status_synced_at timestamptz,
  lark_expense_category text,
  submitted_amount numeric(14, 2),
  submitted_currency text,
  plan_rows jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint shipment_lark_submissions_instance_uidx unique (lark_instance_code),
  constraint shipment_lark_submissions_status_check
    check (
      lark_approval_status is null
      or lark_approval_status in (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'CANCELED',
        'DELETED'
      )
    )
);

create index if not exists shipment_lark_submissions_shipment_idx
  on public.shipment_lark_submissions (shipment_id, invoice_kind, submitted_at desc);

comment on table public.shipment_lark_submissions is
  'Lark AP Form submissions for shipment tax invoices and shipping invoices';

alter table public.shipment_lark_submissions enable row level security;

drop policy if exists "authenticated read shipment lark submissions"
  on public.shipment_lark_submissions;
create policy "authenticated read shipment lark submissions"
  on public.shipment_lark_submissions for select
  to authenticated
  using (true);

drop policy if exists "writer write shipment lark submissions"
  on public.shipment_lark_submissions;
create policy "writer write shipment lark submissions"
  on public.shipment_lark_submissions for all
  to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
