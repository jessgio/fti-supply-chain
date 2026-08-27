-- Last recorded purchase unit cost per SKU + currency, derived from PO lines.
-- Used to recommend unit cost when creating / editing purchase orders.

create table if not exists public.sku_last_purchase_costs (
  sku_id uuid not null references public.skus (id) on delete cascade,
  currency text not null,
  unit_cost numeric(14, 5) not null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  po_line_id uuid references public.purchase_order_lines (id) on delete set null,
  po_number text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  supplier_name text,
  order_date date,
  updated_at timestamptz not null default now(),
  primary key (sku_id, currency),
  constraint sku_last_purchase_costs_unit_cost_check check (unit_cost >= 0)
);

create index if not exists sku_last_purchase_costs_updated_idx
  on public.sku_last_purchase_costs (updated_at desc);

comment on table public.sku_last_purchase_costs is
  'Latest non-cancelled PO unit cost per SKU and currency (finished goods + packaging).';

alter table public.sku_last_purchase_costs enable row level security;

drop policy if exists "authenticated read sku last purchase costs"
  on public.sku_last_purchase_costs;
create policy "authenticated read sku last purchase costs"
  on public.sku_last_purchase_costs for select
  to authenticated
  using (true);

drop policy if exists "writer write sku last purchase costs"
  on public.sku_last_purchase_costs;
create policy "writer write sku last purchase costs"
  on public.sku_last_purchase_costs for all
  to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));

-- Backfill from historical PO lines (most recent order_date / created_at wins).
insert into public.sku_last_purchase_costs (
  sku_id,
  currency,
  unit_cost,
  po_id,
  po_line_id,
  po_number,
  supplier_id,
  supplier_name,
  order_date,
  updated_at
)
select distinct on (pol.sku_id, po.currency)
  pol.sku_id,
  upper(trim(po.currency)),
  pol.unit_cost,
  po.id,
  pol.id,
  po.po_number,
  po.supplier_id,
  s.name,
  po.order_date,
  now()
from public.purchase_order_lines pol
join public.purchase_orders po on po.id = pol.po_id
left join public.suppliers s on s.id = po.supplier_id
where pol.unit_cost is not null
  and pol.sku_id is not null
  and po.status is distinct from 'cancelled'
  and coalesce(trim(po.currency), '') <> ''
order by
  pol.sku_id,
  po.currency,
  po.order_date desc nulls last,
  po.created_at desc,
  pol.id desc
on conflict (sku_id, currency) do update set
  unit_cost = excluded.unit_cost,
  po_id = excluded.po_id,
  po_line_id = excluded.po_line_id,
  po_number = excluded.po_number,
  supplier_id = excluded.supplier_id,
  supplier_name = excluded.supplier_name,
  order_date = excluded.order_date,
  updated_at = excluded.updated_at;
