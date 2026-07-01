-- Fix UTF-8 mojibake in delivery note packaging catalog product names
-- (em/en dashes and non-breaking spaces misread as Latin-1)

update public.secondary_packaging_inbound_cosmax
set product_name = replace(
  replace(
    replace(
      replace(
        product_name,
        chr(226) || chr(128) || chr(147),
        chr(8211)
      ),
      chr(226) || chr(128) || chr(148),
      chr(8212)
    ),
    chr(194) || chr(160),
    ' '
  ),
  chr(194),
  ''
)
where product_name like '%' || chr(226) || '%'
   or product_name like '%' || chr(194) || '%';
