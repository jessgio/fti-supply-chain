-- A PO can have several Lark AP Forms (down payment, then balance, then
-- another). Uniqueness is one row per Lark instance, not one row per PO.
-- Drop any extra unique constraint that rejects the second form. Keep the
-- instance-code unique index.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'purchase_order_lark_submissions'
      and con.contype = 'u'
      and con.conname <> 'purchase_order_lark_submissions_instance_uidx'
  loop
    execute format(
      'alter table public.purchase_order_lark_submissions drop constraint %I',
      r.conname
    );
  end loop;

  for r in
    select idx.relname as index_name
    from pg_index i
    join pg_class tbl on tbl.oid = i.indrelid
    join pg_class idx on idx.oid = i.indexrelid
    join pg_namespace nsp on nsp.oid = tbl.relnamespace
    where nsp.nspname = 'public'
      and tbl.relname = 'purchase_order_lark_submissions'
      and i.indisunique
      and i.indisprimary = false
      and idx.relname <> 'purchase_order_lark_submissions_instance_uidx'
  loop
    execute format(
      'drop index if exists public.%I',
      r.index_name
    );
  end loop;
end $$;
