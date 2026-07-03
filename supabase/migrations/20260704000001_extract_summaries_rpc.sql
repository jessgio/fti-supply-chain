-- Aggregate extract ledger stats in Postgres instead of loading every transaction
-- into the app for the list view.

create or replace function public.get_extract_summaries()
returns table (
  extract_id uuid,
  txn_count bigint,
  first_date date,
  last_date date,
  starting_balance numeric,
  ending_balance numeric,
  total_received numeric,
  total_issued numeric,
  waste_issued numeric
)
language sql
stable
as $$
  with ordered as (
    select
      t.extract_id,
      t.txn_date,
      t.seq,
      t.received,
      t.issued,
      t.balance,
      t.category,
      row_number() over (
        partition by t.extract_id
        order by t.txn_date, t.seq
      ) as rn_first,
      row_number() over (
        partition by t.extract_id
        order by t.txn_date desc, t.seq desc
      ) as rn_last
    from public.extract_transactions t
  ),
  agg as (
    select
      extract_id,
      count(*)::bigint as txn_count,
      min(txn_date) as first_date,
      max(txn_date) as last_date,
      coalesce(sum(received), 0) as total_received,
      coalesce(sum(issued), 0) as total_issued,
      coalesce(
        sum(case when category = 'waste'::public.extract_category then issued else 0 end),
        0
      ) as waste_issued
    from public.extract_transactions
    group by extract_id
  ),
  first_row as (
    select extract_id, balance, received, issued
    from ordered
    where rn_first = 1
  ),
  last_balance as (
    select distinct on (extract_id)
      extract_id,
      balance
    from ordered
    where balance is not null
    order by extract_id, txn_date desc, seq desc
  )
  select
    a.extract_id,
    a.txn_count,
    a.first_date,
    a.last_date,
    case
      when f.balance is not null then f.balance - f.received + f.issued
      else 0::numeric
    end as starting_balance,
    coalesce(l.balance, case
      when f.balance is not null then f.balance - f.received + f.issued
      else 0::numeric
    end) as ending_balance,
    a.total_received,
    a.total_issued,
    a.waste_issued
  from agg a
  left join first_row f on f.extract_id = a.extract_id
  left join last_balance l on l.extract_id = a.extract_id;
$$;

grant execute on function public.get_extract_summaries() to authenticated, service_role;
