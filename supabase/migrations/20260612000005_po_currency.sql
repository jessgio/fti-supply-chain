-- Purchase order currency for multi-currency supplier deals

alter table public.purchase_orders
  add column currency text not null default 'IDR'
    check (currency in ('IDR', 'USD', 'CNY', 'HKD', 'EUR', 'SGD', 'JPY', 'KRW'));
