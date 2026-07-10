-- Allow multiple Lark AP Form submissions per PO (e.g. down payment then balance).

create table if not exists public.purchase_order_lark_submissions (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  lark_instance_code text not null,
  lark_serial_number text,
  lark_approval_status text,
  lark_status_synced_at timestamptz,
  payment_scope text not null default 'both'
    check (payment_scope in ('both', 'down_payment', 'balance')),
  lark_expense_category text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint purchase_order_lark_submissions_instance_uidx unique (lark_instance_code),
  constraint purchase_order_lark_submissions_status_check
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

create index if not exists purchase_order_lark_submissions_po_idx
  on public.purchase_order_lark_submissions (purchase_order_id, submitted_at desc);

comment on table public.purchase_order_lark_submissions is
  'History of Lark AP Form submissions for a PO (supports separate DP / balance forms)';

alter table public.purchase_order_lark_submissions enable row level security;

drop policy if exists "authenticated read po lark submissions" on public.purchase_order_lark_submissions;
create policy "authenticated read po lark submissions"
  on public.purchase_order_lark_submissions for select
  to authenticated
  using (true);

drop policy if exists "writer write po lark submissions" on public.purchase_order_lark_submissions;
create policy "writer write po lark submissions"
  on public.purchase_order_lark_submissions for all
  to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

-- Backfill existing single submissions into history.
insert into public.purchase_order_lark_submissions (
  purchase_order_id,
  lark_instance_code,
  lark_serial_number,
  lark_approval_status,
  lark_status_synced_at,
  payment_scope,
  lark_expense_category,
  submitted_at
)
select
  id,
  lark_instance_code,
  lark_serial_number,
  lark_approval_status,
  lark_status_synced_at,
  'both',
  lark_expense_category,
  coalesce(lark_submitted_at, now())
from public.purchase_orders
where lark_instance_code is not null
on conflict (lark_instance_code) do nothing;
