-- Unclassified SKU count (sidebar badge) and the Needs classification list
-- filter the same four columns. A partial index keeps that lookup off a
-- sequential scan as the catalog grows.
create index if not exists skus_unclassified_sku_code_idx
  on public.skus (sku_code)
  where is_bundle = false
    and is_packaging = false
    and is_extract = false
    and franchise_id is null;
