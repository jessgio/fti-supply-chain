-- Freeze AP Form and payment schedule amounts so later PO qty/price edits
-- do not rewrite submitted AP amounts or expected down payment / balance.

alter table public.purchase_order_lark_submissions
  add column if not exists submitted_amount numeric(14, 2),
  add column if not exists submitted_currency text,
  add column if not exists plan_rows jsonb;

comment on column public.purchase_order_lark_submissions.submitted_amount is
  'Total amount filed on this AP Form (sum of plan rows). Immutable after insert.';
comment on column public.purchase_order_lark_submissions.submitted_currency is
  'Currency of submitted_amount / plan_rows.';
comment on column public.purchase_order_lark_submissions.plan_rows is
  'Snapshot of payment plan rows sent to Lark (date, amount, currency, remarks).';

alter table public.purchase_orders
  add column if not exists committed_invoice_total numeric(14, 2),
  add column if not exists committed_down_payment numeric(14, 2),
  add column if not exists committed_balance numeric(14, 2),
  add column if not exists payment_amounts_committed_at timestamptz;

comment on column public.purchase_orders.committed_invoice_total is
  'Frozen invoice total for payment expectations / PDF payment section after AP or first payment.';
comment on column public.purchase_orders.committed_down_payment is
  'Frozen down-payment amount; stops tracking live PO line totals once set.';
comment on column public.purchase_orders.committed_balance is
  'Frozen balance / final payment amount; stops tracking live PO line totals once set.';
comment on column public.purchase_orders.payment_amounts_committed_at is
  'When payment schedule amounts were first frozen.';

-- Backfill committed schedule from logged payments when present (source of truth
-- for amounts already paid). Does not invent amounts for unpaid sides.
with paid as (
  select
    po_id,
    round(
      sum(amount) filter (where lower(trim(purpose)) = 'down payment'),
      2
    ) as paid_down,
    round(
      sum(amount) filter (where lower(trim(purpose)) = 'balance payment'),
      2
    ) as paid_balance
  from public.po_payments
  group by po_id
)
update public.purchase_orders po
set
  committed_down_payment = coalesce(po.committed_down_payment, paid.paid_down),
  committed_balance = coalesce(po.committed_balance, paid.paid_balance),
  committed_invoice_total = coalesce(
    po.committed_invoice_total,
    case
      when paid.paid_down is not null and paid.paid_balance is not null
        then paid.paid_down + paid.paid_balance
      else null
    end
  ),
  payment_amounts_committed_at = coalesce(
    po.payment_amounts_committed_at,
    case
      when paid.paid_down is not null or paid.paid_balance is not null
        then now()
      else null
    end
  )
from paid
where po.id = paid.po_id
  and po.payment_amounts_committed_at is null;
