-- Official RSP is master data, not WMS Harga. Sales/stock uploads used to keep
-- the maximum Harga per SKU and never lower it, so pack/line totals became list.
-- Each of these SKUs has a single 2000-01-01 history row; overwriting it
-- corrects every as-of date. skus.retail_price syncs via trigger.

with corrections (sku_code, retail_price) as (
  values
    ('LPB-ILP-LIPBUTTER-PINKSUGAR'::text, 149000::numeric),
    ('FTO-SGC-AHASOLUTION-100ML', 190000),
    ('FWA-BLP-MICELLARWATER-265ML', 159000),
    ('LPB-ILP-LIPBUTTER-CINNAMONTOAST', 149000),
    ('LPB-ILP-LIPBUTTER-WOODYROSE', 149000)
)
update public.sku_retail_prices p
set retail_price = c.retail_price
from corrections c
join public.skus s on s.sku_code = c.sku_code
where p.sku_id = s.id
  and p.retail_price is distinct from c.retail_price;
