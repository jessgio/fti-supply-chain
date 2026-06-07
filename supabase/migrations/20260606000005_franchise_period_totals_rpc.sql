-- Aggregate franchise sales by period in SQL (avoids PostgREST 1000-row default cap)

create or replace function public.get_franchise_period_totals(
  p_grain text default 'month',
  p_from date default null,
  p_to date default null,
  p_channel_id uuid default null,
  p_franchise_id uuid default null
)
returns table (
  sale_date date,
  channel_id uuid,
  channel_name text,
  franchise_id uuid,
  franchise_name text,
  total_qty numeric,
  total_net_sales numeric
)
language sql
stable
as $$
  select
    case p_grain
      when 'day' then fdt.sale_date
      when 'week' then date_trunc('week', fdt.sale_date)::date
      when 'month' then date_trunc('month', fdt.sale_date)::date
      when 'year' then date_trunc('year', fdt.sale_date)::date
      else date_trunc('month', fdt.sale_date)::date
    end as sale_date,
    fdt.channel_id,
    fdt.channel_name,
    fdt.franchise_id,
    fdt.franchise_name,
    sum(fdt.total_qty) as total_qty,
    sum(fdt.total_net_sales) as total_net_sales
  from public.franchise_daily_totals fdt
  where fdt.franchise_id is not null
    and (p_from is null or fdt.sale_date >= p_from)
    and (p_to is null or fdt.sale_date <= p_to)
    and (p_channel_id is null or fdt.channel_id = p_channel_id)
    and (p_franchise_id is null or fdt.franchise_id = p_franchise_id)
  group by 1, 2, 3, 4, 5
  order by 1;
$$;
