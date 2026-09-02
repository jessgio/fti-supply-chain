-- Sales upload was hitting PostgREST's 8s statement_timeout because
-- refresh_franchise_sales_daily_agg called sku_retail_price_as_of() once per
-- bundle line. Rebuild aggregates with a set-based price-range join, optional
-- date window, and join franchise_id from skus after backfill.

drop function if exists public.refresh_franchise_sales_daily_agg();
drop function if exists public.refresh_franchise_sales_daily_agg(date, date);

create function public.refresh_franchise_sales_daily_agg(
  from_date date default null,
  to_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
set work_mem = '64MB'
as $$
begin
  perform public.backfill_sku_franchise_ids();

  if from_date is null or to_date is null then
    truncate public.sku_sales_daily_agg;
    truncate public.franchise_sales_daily_agg;
  else
    delete from public.sku_sales_daily_agg
    where sale_date >= from_date
      and sale_date <= to_date;
    delete from public.franchise_sales_daily_agg
    where sale_date >= from_date
      and sale_date <= to_date;
  end if;

  insert into public.sku_sales_daily_agg (
    sale_date,
    channel_id,
    sku_code,
    total_qty,
    total_net_sales
  )
  with price_ranges as (
    select
      sku_id,
      retail_price,
      effective_from,
      lead(effective_from) over (partition by sku_id order by effective_from) as effective_until
    from public.sku_retail_prices
  ),
  sku_direct as (
    select
      s.sku_code,
      sr.sale_date,
      sr.channel_id,
      sum(sr.qty_sold) as qty_sold,
      sum(sr.net_sales) as net_sales
    from public.sales_records sr
    join public.skus s on s.id = sr.sku_id
    where s.is_bundle = false
      and (from_date is null or sr.sale_date >= from_date)
      and (to_date is null or sr.sale_date <= to_date)
    group by s.sku_code, sr.sale_date, sr.channel_id
  ),
  bundle_daily as (
    select
      sr.sale_date,
      sr.channel_id,
      sr.sku_id as bundle_sku_id,
      sum(sr.qty_sold) as bundle_qty,
      sum(sr.net_sales) as bundle_net_sales
    from public.sales_records sr
    join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
    where (from_date is null or sr.sale_date >= from_date)
      and (to_date is null or sr.sale_date <= to_date)
    group by sr.sale_date, sr.channel_id, sr.sku_id
  ),
  bundle_lines as (
    select
      bd.sale_date,
      bd.channel_id,
      cs.sku_code,
      bd.bundle_qty * bc.qty_per_bundle as qty_sold,
      bd.bundle_net_sales,
      bc.qty_per_bundle,
      coalesce(pr.retail_price, cs.retail_price, 0) as component_rsp,
      bd.bundle_sku_id
    from bundle_daily bd
    join public.bundle_components bc on bc.bundle_sku_id = bd.bundle_sku_id
    join public.skus cs on cs.id = bc.component_sku_id
    left join price_ranges pr
      on pr.sku_id = cs.id
      and bd.sale_date >= pr.effective_from
      and (pr.effective_until is null or bd.sale_date < pr.effective_until)
  ),
  bundle_shares as (
    select
      sale_date,
      channel_id,
      sku_code,
      qty_sold,
      bundle_net_sales * (
        case
          when sum(case when component_rsp > 0 then 1 else 0 end) over w
               = count(*) over w
            and sum(component_rsp * qty_per_bundle) over w > 0
          then (component_rsp * qty_per_bundle)
            / nullif(sum(component_rsp * qty_per_bundle) over w, 0)
          else qty_per_bundle / nullif(sum(qty_per_bundle) over w, 0)
        end
      ) as net_sales
    from bundle_lines
    window w as (partition by bundle_sku_id, sale_date, channel_id)
  ),
  sku_daily as (
    select sku_code, sale_date, channel_id, qty_sold, net_sales from sku_direct
    union all
    select sku_code, sale_date, channel_id, qty_sold, net_sales from bundle_shares
  )
  select
    sale_date,
    channel_id,
    sku_code,
    sum(qty_sold) as total_qty,
    sum(net_sales) as total_net_sales
  from sku_daily
  group by sale_date, channel_id, sku_code;

  insert into public.franchise_sales_daily_agg (
    sale_date,
    channel_id,
    franchise_id,
    total_qty,
    total_net_sales
  )
  select
    sd.sale_date,
    sd.channel_id,
    s.franchise_id,
    sum(sd.total_qty) as total_qty,
    sum(sd.total_net_sales) as total_net_sales
  from public.sku_sales_daily_agg sd
  join public.skus s on s.sku_code = sd.sku_code
  where s.franchise_id is not null
    and (from_date is null or sd.sale_date >= from_date)
    and (to_date is null or sd.sale_date <= to_date)
  group by sd.sale_date, sd.channel_id, s.franchise_id;
end;
$$;

comment on function public.refresh_franchise_sales_daily_agg(date, date) is
  'Rebuild SKU and franchise daily sales aggregates. Pass from_date and to_date to refresh a window; omit both for a full rebuild.';

revoke execute on function public.refresh_franchise_sales_daily_agg(date, date) from public, anon;
grant execute on function public.refresh_franchise_sales_daily_agg(date, date)
  to authenticated, service_role;

create or replace view public.franchise_sales_expanded
with (security_invoker = true)
as
with price_ranges as (
  select
    sku_id,
    retail_price,
    effective_from,
    lead(effective_from) over (partition by sku_id order by effective_from) as effective_until
  from public.sku_retail_prices
),
direct_sales as (
  select
    sr.id as sales_record_id,
    sr.sale_date,
    sr.channel_id,
    sr.sku_id as source_sku_id,
    sr.qty_sold,
    sr.net_sales,
    s.franchise_id,
    s.sku_code,
    false as from_bundle
  from public.sales_records sr
  join public.skus s on s.id = sr.sku_id
  where s.is_bundle = false
),
bundle_lines as (
  select
    sr.id as sales_record_id,
    sr.sale_date,
    sr.channel_id,
    sr.sku_id as source_sku_id,
    sr.qty_sold * bc.qty_per_bundle as qty_sold,
    sr.net_sales,
    cs.franchise_id,
    cs.sku_code,
    bc.qty_per_bundle,
    coalesce(pr.retail_price, cs.retail_price, 0) as component_rsp
  from public.sales_records sr
  join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
  join public.bundle_components bc on bc.bundle_sku_id = bs.id
  join public.skus cs on cs.id = bc.component_sku_id
  left join price_ranges pr
    on pr.sku_id = cs.id
    and sr.sale_date >= pr.effective_from
    and (pr.effective_until is null or sr.sale_date < pr.effective_until)
),
bundle_sales as (
  select
    sales_record_id,
    sale_date,
    channel_id,
    source_sku_id,
    qty_sold,
    net_sales * (
      case
        when sum(case when component_rsp > 0 then 1 else 0 end) over w
             = count(*) over w
          and sum(component_rsp * qty_per_bundle) over w > 0
        then (component_rsp * qty_per_bundle)
          / nullif(sum(component_rsp * qty_per_bundle) over w, 0)
        else qty_per_bundle / nullif(sum(qty_per_bundle) over w, 0)
      end
    ) as net_sales,
    franchise_id,
    sku_code,
    true as from_bundle
  from bundle_lines
  window w as (partition by sales_record_id)
)
select * from direct_sales
union all
select * from bundle_sales;

notify pgrst, 'reload schema';
