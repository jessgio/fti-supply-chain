-- PO printout support: supplier address/PIC, company settings, payment terms

alter table public.suppliers
  add column address text,
  add column pic_name text,
  add column pic_email text,
  add column pic_phone text;

alter table public.purchase_orders
  add column down_payment_pct numeric(5, 2) not null default 30
    check (down_payment_pct >= 0 and down_payment_pct <= 100);

create table public.company_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  company_name text not null default 'From This Island',
  address text,
  pic_name text,
  pic_email text,
  pic_phone text,
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id, company_name)
values ('00000000-0000-0000-0000-000000000001', 'From This Island');

alter table public.company_settings enable row level security;

create policy "authenticated read company_settings" on public.company_settings
  for select to authenticated using (true);
create policy "authenticated write company_settings" on public.company_settings
  for all to authenticated using (true) with check (true);
