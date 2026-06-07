-- Incremental sales upload: replace records in a date range instead of full truncate

create or replace function public.replace_sales_records_in_range(
  from_date date,
  to_date date
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  with deleted as (
    delete from public.sales_records
    where sale_date >= from_date
      and sale_date <= to_date
    returning 1
  )
  select count(*) into deleted_count from deleted;
  return deleted_count;
end;
$$;
