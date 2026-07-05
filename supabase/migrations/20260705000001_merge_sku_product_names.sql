-- Unify vendor product names with SKU product names (skus.name)

update public.skus s
set name = v.vendor_product_name
from public.sku_vendor_product_names v
where s.id = v.sku_id
  and trim(v.vendor_product_name) <> '';

drop table public.sku_vendor_product_names;
