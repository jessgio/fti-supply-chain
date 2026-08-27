-- Backfill frozen AP Form amounts from committed PO payment schedule
-- (and logged payments when a committed side is missing) so historical
-- submissions stop tracking live PO line edits.

update public.purchase_order_lark_submissions s
set
  submitted_amount = case s.payment_scope
    when 'down_payment' then po.committed_down_payment
    when 'balance' then po.committed_balance
    when 'both' then coalesce(
      po.committed_invoice_total,
      case
        when po.committed_down_payment is not null
          and po.committed_balance is not null
          then po.committed_down_payment + po.committed_balance
        else null
      end
    )
    else null
  end,
  submitted_currency = coalesce(s.submitted_currency, po.currency)
from public.purchase_orders po
where po.id = s.purchase_order_id
  and s.submitted_amount is null
  and (
    (s.payment_scope = 'down_payment' and po.committed_down_payment is not null)
    or (s.payment_scope = 'balance' and po.committed_balance is not null)
    or (
      s.payment_scope = 'both'
      and (
        po.committed_invoice_total is not null
        or (
          po.committed_down_payment is not null
          and po.committed_balance is not null
        )
      )
    )
  );

with paid as (
  select
    po_id,
    round(sum(amount) filter (where lower(trim(purpose)) = 'down payment'), 2) as paid_down,
    round(sum(amount) filter (where lower(trim(purpose)) = 'balance payment'), 2) as paid_balance
  from public.po_payments
  group by po_id
)
update public.purchase_order_lark_submissions s
set
  submitted_amount = case s.payment_scope
    when 'down_payment' then coalesce(po.committed_down_payment, paid.paid_down)
    when 'balance' then coalesce(po.committed_balance, paid.paid_balance)
    when 'both' then coalesce(
      po.committed_invoice_total,
      case
        when coalesce(po.committed_down_payment, paid.paid_down) is not null
          and coalesce(po.committed_balance, paid.paid_balance) is not null
          then coalesce(po.committed_down_payment, paid.paid_down)
            + coalesce(po.committed_balance, paid.paid_balance)
        else null
      end
    )
  end,
  submitted_currency = coalesce(s.submitted_currency, po.currency)
from public.purchase_orders po
left join paid on paid.po_id = po.id
where po.id = s.purchase_order_id
  and s.submitted_amount is null
  and (
    (s.payment_scope = 'down_payment' and coalesce(po.committed_down_payment, paid.paid_down) is not null)
    or (s.payment_scope = 'balance' and coalesce(po.committed_balance, paid.paid_balance) is not null)
    or (
      s.payment_scope = 'both'
      and coalesce(po.committed_down_payment, paid.paid_down) is not null
      and coalesce(po.committed_balance, paid.paid_balance) is not null
    )
  );
