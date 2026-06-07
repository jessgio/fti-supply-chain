-- SKU retail price (RSP / Harga) for RSP-weighted bundle net sales allocation

alter table public.skus
  add column if not exists retail_price numeric(14, 2) check (retail_price is null or retail_price >= 0);

comment on column public.skus.retail_price is
  'Retail selling price (Harga / RSP). Used to split bundle net sales across components by RSP contribution.';

create or replace view public.franchise_sales_expanded
with (security_invoker = true)
as
with direct_sales as (
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
bundle_sales as (
  select
    sr.id as sales_record_id,
    sr.sale_date,
    sr.channel_id,
    sr.sku_id as source_sku_id,
    sr.qty_sold * bc.qty_per_bundle as qty_sold,
    sr.net_sales * (
      case
        when sum(
          case when coalesce(cs.retail_price, 0) > 0 then 1 else 0 end
        ) over (partition by sr.id) = count(*) over (partition by sr.id)
          and sum(coalesce(cs.retail_price, 0) * bc.qty_per_bundle) over (partition by sr.id) > 0
        then (coalesce(cs.retail_price, 0) * bc.qty_per_bundle) / nullif(
          sum(coalesce(cs.retail_price, 0) * bc.qty_per_bundle) over (partition by sr.id),
          0
        )
        else bc.qty_per_bundle / nullif(
          sum(bc.qty_per_bundle) over (partition by sr.id),
          0
        )
      end
    ) as net_sales,
    cs.franchise_id,
    cs.sku_code,
    true as from_bundle
  from public.sales_records sr
  join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
  join public.bundle_components bc on bc.bundle_sku_id = bs.id
  join public.skus cs on cs.id = bc.component_sku_id
)
select * from direct_sales
union all
select * from bundle_sales;
