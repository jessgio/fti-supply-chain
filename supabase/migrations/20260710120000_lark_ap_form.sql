-- Lark AP Form (应付单) integration: user directory + PO submission tracking.

-- ─── updated_at helper (shared) ───────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Lark user directory (email → open_id) ───────────────────────────────────
create table if not exists public.lark_user_directory (
  email text primary key,
  lark_open_id text not null,
  display_name text not null default '',
  is_default_approver boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lark_user_directory_email_domains
    check (
      email like '%@fromthisisland.com'
      or email like '%@aerisbeaute.com'
    ),
  constraint lark_user_directory_open_id_format
    check (lark_open_id ~ '^ou_[a-zA-Z0-9]+$')
);

create index if not exists lark_user_directory_open_id_idx
  on public.lark_user_directory (lark_open_id);

create index if not exists lark_user_directory_default_approver_idx
  on public.lark_user_directory (is_default_approver)
  where is_default_approver = true;

comment on table public.lark_user_directory is
  'Maps FTI/Aeris emails to Lark open_ids for AP Form submitter + approver selection';
comment on column public.lark_user_directory.lark_open_id is
  'Lark open_id (ou_...). Multiple emails may share the same open_id.';
comment on column public.lark_user_directory.is_default_approver is
  'When true, pre-selected as an approver on Lark AP Form submit';

drop trigger if exists lark_user_directory_updated_at on public.lark_user_directory;
create trigger lark_user_directory_updated_at
  before update on public.lark_user_directory
  for each row execute function public.set_updated_at();

alter table public.lark_user_directory enable row level security;

drop policy if exists "authenticated read lark directory" on public.lark_user_directory;
create policy "authenticated read lark directory"
  on public.lark_user_directory for select
  to authenticated
  using (true);

drop policy if exists "admin write lark directory" on public.lark_user_directory;
create policy "admin write lark directory"
  on public.lark_user_directory for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ─── Purchase order Lark AP columns ─────────────────────────────────────────
alter table public.purchase_orders
  add column if not exists lark_instance_code text,
  add column if not exists lark_serial_number text,
  add column if not exists lark_submitted_at timestamptz,
  add column if not exists lark_expense_category text,
  add column if not exists lark_approval_status text,
  add column if not exists lark_status_synced_at timestamptz;

comment on column public.purchase_orders.lark_instance_code is
  'Lark Approval instance code returned after submitting AP Form';
comment on column public.purchase_orders.lark_serial_number is
  'Lark Approval serial/reference number (审批单编号)';
comment on column public.purchase_orders.lark_submitted_at is
  'When this PO was submitted to Lark AP Form';
comment on column public.purchase_orders.lark_expense_category is
  'Expense category option value sent to Lark (支出类别)';
comment on column public.purchase_orders.lark_approval_status is
  'Lark Approval instance status: PENDING, APPROVED, REJECTED, CANCELED, DELETED';
comment on column public.purchase_orders.lark_status_synced_at is
  'When lark_approval_status was last synced from Lark';

alter table public.purchase_orders
  drop constraint if exists purchase_orders_lark_approval_status_check;

alter table public.purchase_orders
  add constraint purchase_orders_lark_approval_status_check
  check (
    lark_approval_status is null
    or lark_approval_status in (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELED',
      'DELETED'
    )
  );

create unique index if not exists purchase_orders_lark_instance_code_uidx
  on public.purchase_orders (lark_instance_code)
  where lark_instance_code is not null;

create unique index if not exists purchase_orders_lark_serial_number_uidx
  on public.purchase_orders (lark_serial_number)
  where lark_serial_number is not null;
