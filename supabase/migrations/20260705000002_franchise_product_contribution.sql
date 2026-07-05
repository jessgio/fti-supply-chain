-- Product contribution by franchise for MTD and YTD windows

create or replace function public.get_franchise_product_contribution(
  p_as_of date default null,
  p_channel_id uuid default null,
  p_franchise_id uuid default null
)
returns table (
  window_type text,
  franchise_id uuid,
  franchise_name text,
  sku_code text,
  product_name text,
  total_qty numeric,
  total_net_sales numeric
)
language sql
stable
as $$
  with latest as (
    select coalesce(p_as_of, max(sd.sale_date)) as as_of
    from public.sku_sales_daily_agg sd
  ),
  windows as (
    select
      'mtd'::text as window_type,
      date_trunc('month', l.as_of)::date as from_date,
      l.as_of as to_date
    from latest l
    where l.as_of is not null
    union all
    select
      'ytd'::text,
      date_trunc('year', l.as_of)::date,
      l.as_of
    from latest l
    where l.as_of is not null
  )
  select
    w.window_type,
    pf.id as franchise_id,
    pf.name as franchise_name,
    sd.sku_code,
    coalesce(nullif(trim(s.name), ''), sd.sku_code) as product_name,
    sum(sd.total_qty)::numeric as total_qty,
    sum(sd.total_net_sales)::numeric as total_net_sales
  from windows w
  cross join public.sku_sales_daily_agg sd
  join public.skus s on s.sku_code = sd.sku_code
  join public.product_franchises pf on pf.id = s.franchise_id
  cross join latest l
  where sd.sale_date between w.from_date and w.to_date
    and s.franchise_id is not null
    and s.is_bundle = false
    and (p_channel_id is null or sd.channel_id = p_channel_id)
    and (p_franchise_id is null or s.franchise_id = p_franchise_id)
  group by
    w.window_type,
    pf.id,
    pf.name,
    sd.sku_code,
    s.name
  having sum(sd.total_qty) <> 0 or sum(sd.total_net_sales) <> 0
  order by w.window_type, pf.name, sum(sd.total_net_sales) desc;
$$;
