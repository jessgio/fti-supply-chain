-- Separate SHIP TO defaults for extract inbound delivery notes (manufacturer, not CDC packaging)

create table public.extract_inbound_dn_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000004',
  recipient_company text not null default 'PT. Cosmax Indonesia',
  recipient_address text not null default
    'Jl. Raya Narogong KM 12, Bojong Menteng, Kec. Bantar Gebang, Bekasi, Jawa Barat 17116',
  recipient_pic_name text,
  recipient_phone text,
  recipient_email text,
  updated_at timestamptz not null default now()
);

insert into public.extract_inbound_dn_settings (id, recipient_pic_name)
values ('00000000-0000-0000-0000-000000000004', 'Pak Erwin Hadi');

alter table public.extract_inbound_dn_settings enable row level security;

create policy "read extract inbound dn settings" on public.extract_inbound_dn_settings
  for select to authenticated using (true);

create policy "write extract inbound dn settings" on public.extract_inbound_dn_settings
  for update to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
