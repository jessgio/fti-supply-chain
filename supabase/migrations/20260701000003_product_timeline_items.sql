-- Multiple products per timeline: move product rows to a child table.

create table public.product_timeline_items (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.product_timelines (id) on delete cascade,
  product_name text not null,
  sku_id uuid references public.skus (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.product_timeline_items (timeline_id, product_name, sku_id, sort_order)
select id, product_name, sku_id, 0
from public.product_timelines;

alter table public.product_timelines
  drop constraint if exists product_timelines_product_name_key;

alter table public.product_timelines
  drop column product_name,
  drop column sku_id;

create index product_timeline_items_timeline_id_idx
  on public.product_timeline_items (timeline_id, sort_order);

create unique index product_timeline_items_timeline_sku_uidx
  on public.product_timeline_items (timeline_id, sku_id)
  where sku_id is not null;

create unique index product_timeline_items_timeline_name_uidx
  on public.product_timeline_items (timeline_id, lower(product_name))
  where sku_id is null;

alter table public.product_timeline_items enable row level security;

create policy "authenticated read product_timeline_items" on public.product_timeline_items
  for select to authenticated using (true);

create policy "writer write product_timeline_items" on public.product_timeline_items
  for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
