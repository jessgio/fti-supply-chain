-- Return monthly actuals as one JSON payload so PostgREST does not
-- re-run the aggregation once per 1000-row page.

create or replace function public.get_sop_monthly_actuals_json(
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sku_id', t.sku_id,
        'channel_id', t.channel_id,
        'sale_year', t.sale_year,
        'sale_month', t.sale_month,
        'qty', t.qty,
        'net_sales', t.net_sales
      )
    ),
    '[]'::jsonb
  )
  from public.get_sop_monthly_actuals(p_start, p_end) t;
$$;

comment on function public.get_sop_monthly_actuals_json(date, date) is
  'JSON wrapper for get_sop_monthly_actuals so S&OP can load all months in one round trip.';

grant execute on function public.get_sop_monthly_actuals_json(date, date) to authenticated;
grant execute on function public.get_sop_monthly_actuals_json(date, date) to service_role;
