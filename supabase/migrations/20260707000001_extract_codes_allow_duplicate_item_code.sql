-- Multiple extract catalog rows may share the same item code (e.g. "-" when a supplier
-- has no 7-digit code). Uniqueness is on the item_code + extract_name pair.

alter table public.extract_codes
  drop constraint if exists extract_codes_item_code_unique;

alter table public.extract_codes
  add constraint extract_codes_item_code_extract_name_unique
  unique (item_code, extract_name);
