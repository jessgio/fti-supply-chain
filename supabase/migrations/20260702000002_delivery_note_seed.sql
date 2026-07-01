-- Sample Secondary Packaging Inbound to Cosmax catalog + Cosmax recipient defaults

insert into public.secondary_packaging_inbound_cosmax (item_code, product_name)
values
  (
    '6359070027Q0',
    'FTI FROM THIS ISLAND Tamanu Acne Defense Serum 25ml #Unit Box'
  ),
  (
    '6359070034Q7',
    'FTI FROM THIS ISLAND Brightening Serum 25ml #Unit Box'
  ),
  (
    '6359070041K2',
    'FTI FROM THIS ISLAND Hydrating Toner 100ml #Unit Box'
  )
on conflict (item_code) do nothing;

update public.delivery_note_settings
set
  recipient_company = 'PT. Guru Indonesia',
  recipient_address =
    'Cosmax Distribution Center (CDC), Jl. Curug Dengdeng, Desa Lulut, GW7F+VH7, Nambo, Klapanunggal, Bogor Regency, West Java 16710',
  recipient_pic_name = 'Agung Setiadi',
  recipient_phone = '+62-813-1948-4759',
  recipient_email = 'agungsetiadi@cosmax.com',
  updated_at = now()
where id = '00000000-0000-0000-0000-000000000002';
