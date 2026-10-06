-- Pre-order (or other stand-in) SKUs alias onto one canonical SKU.
-- Sales, stock, forecast demand, and on-order quantity resolve to the canonical product.

create table public.sku_aliases (
  alias_sku_id uuid primary key,
  canonical_sku_id uuid not null,
  created_at timestamptz not null default now(),
  constraint sku_aliases_alias_sku_id_fkey
    foreign key (alias_sku_id) references public.skus (id) on delete cascade,
  constraint sku_aliases_canonical_sku_id_fkey
    foreign key (canonical_sku_id) references public.skus (id) on delete restrict,
  constraint sku_aliases_distinct check (alias_sku_id <> canonical_sku_id)
);

create index sku_aliases_canonical_idx
  on public.sku_aliases (canonical_sku_id);

comment on table public.sku_aliases is
  'Maps a stand-in SKU (typically a pre-order code) onto the regular SKU for the same product.';

alter table public.sku_aliases enable row level security;

create policy "authenticated read sku_aliases"
  on public.sku_aliases for select
  to authenticated
  using (true);

create or replace function public.sku_aliases_enforce()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.alias_sku_id = new.canonical_sku_id then
    raise exception 'A SKU cannot alias itself.';
  end if;

  if exists (
    select 1
    from public.sku_aliases existing
    where existing.alias_sku_id = new.canonical_sku_id
      and existing.alias_sku_id <> new.alias_sku_id
  ) then
    raise exception 'The canonical SKU is itself an alias. Choose the regular SKU it points to.';
  end if;

  if exists (
    select 1
    from public.sku_aliases existing
    where existing.canonical_sku_id = new.alias_sku_id
      and existing.alias_sku_id <> new.alias_sku_id
  ) then
    raise exception 'Other SKUs already alias onto this pre-order SKU. Point those at the regular SKU first.';
  end if;

  return new;
end;
$$;

create trigger sku_aliases_enforce
  before insert or update on public.sku_aliases
  for each row
  execute function public.sku_aliases_enforce();

revoke all on function public.sku_aliases_enforce() from public, anon, authenticated;

-- Point a stand-in SKU at its canonical SKU and fold history that is still on the stand-in.
create or replace function public.apply_sku_alias(
  p_alias_sku_id uuid,
  p_canonical_sku_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_previous uuid;
  v_sales bigint := 0;
  v_stock bigint := 0;
  v_plans bigint := 0;
begin
  if p_alias_sku_id is null or p_canonical_sku_id is null then
    raise exception 'Both SKUs are required.';
  end if;

  if p_alias_sku_id = p_canonical_sku_id then
    raise exception 'A SKU cannot alias itself.';
  end if;

  if not exists (select 1 from public.skus where id = p_alias_sku_id) then
    raise exception 'Pre-order SKU was not found.';
  end if;

  if not exists (select 1 from public.skus where id = p_canonical_sku_id) then
    raise exception 'Canonical SKU was not found.';
  end if;

  select canonical_sku_id
  into v_previous
  from public.sku_aliases
  where alias_sku_id = p_alias_sku_id;

  insert into public.sku_aliases (alias_sku_id, canonical_sku_id)
  values (p_alias_sku_id, p_canonical_sku_id)
  on conflict (alias_sku_id) do update
    set canonical_sku_id = excluded.canonical_sku_id;

  update public.sales_records
  set sku_id = p_canonical_sku_id
  where sku_id = p_alias_sku_id;
  get diagnostics v_sales = row_count;

  select count(*)
  into v_stock
  from public.stock_levels
  where sku_id = p_alias_sku_id;

  update public.stock_levels canonical
  set qty_on_hand = canonical.qty_on_hand + alias_row.qty_on_hand
  from public.stock_levels alias_row
  where alias_row.sku_id = p_alias_sku_id
    and canonical.sku_id = p_canonical_sku_id
    and canonical.location = alias_row.location
    and canonical.as_of_date = alias_row.as_of_date;

  delete from public.stock_levels alias_row
  using public.stock_levels canonical
  where alias_row.sku_id = p_alias_sku_id
    and canonical.sku_id = p_canonical_sku_id
    and canonical.location = alias_row.location
    and canonical.as_of_date = alias_row.as_of_date;

  update public.stock_levels
  set sku_id = p_canonical_sku_id
  where sku_id = p_alias_sku_id;

  select count(*)
  into v_plans
  from public.sop_sku_month_plans
  where sku_id = p_alias_sku_id;

  update public.sop_sku_month_plans canonical
  set
    projected_qty = canonical.projected_qty + alias_row.projected_qty,
    updated_at = now()
  from public.sop_sku_month_plans alias_row
  where alias_row.sku_id = p_alias_sku_id
    and canonical.sku_id = p_canonical_sku_id
    and canonical.year = alias_row.year
    and canonical.month = alias_row.month
    and canonical.sop_group = alias_row.sop_group;

  delete from public.sop_sku_month_plans alias_row
  using public.sop_sku_month_plans canonical
  where alias_row.sku_id = p_alias_sku_id
    and canonical.sku_id = p_canonical_sku_id
    and canonical.year = alias_row.year
    and canonical.month = alias_row.month
    and canonical.sop_group = alias_row.sop_group;

  update public.sop_sku_month_plans
  set sku_id = p_canonical_sku_id, updated_at = now()
  where sku_id = p_alias_sku_id;

  delete from public.sop_sku_channel_inactive alias_row
  using public.sop_sku_channel_inactive canonical
  where alias_row.sku_id = p_alias_sku_id
    and canonical.sku_id = p_canonical_sku_id
    and canonical.sop_group = alias_row.sop_group;

  update public.sop_sku_channel_inactive
  set sku_id = p_canonical_sku_id
  where sku_id = p_alias_sku_id;

  update public.bundle_components canonical
  set qty_per_bundle = canonical.qty_per_bundle + alias_row.qty_per_bundle
  from public.bundle_components alias_row
  where alias_row.component_sku_id = p_alias_sku_id
    and canonical.component_sku_id = p_canonical_sku_id
    and canonical.bundle_sku_id = alias_row.bundle_sku_id;

  delete from public.bundle_components alias_row
  using public.bundle_components canonical
  where alias_row.component_sku_id = p_alias_sku_id
    and canonical.component_sku_id = p_canonical_sku_id
    and canonical.bundle_sku_id = alias_row.bundle_sku_id;

  update public.bundle_components
  set component_sku_id = p_canonical_sku_id
  where component_sku_id = p_alias_sku_id
    and bundle_sku_id <> p_canonical_sku_id;

  delete from public.bundle_components
  where component_sku_id = p_alias_sku_id;

  delete from public.product_packaging alias_row
  using public.product_packaging canonical
  where alias_row.product_sku_id = p_alias_sku_id
    and canonical.product_sku_id = p_canonical_sku_id
    and canonical.packaging_sku_id = alias_row.packaging_sku_id;

  update public.product_packaging
  set product_sku_id = p_canonical_sku_id
  where product_sku_id = p_alias_sku_id
    and packaging_sku_id <> p_canonical_sku_id;

  delete from public.product_packaging
  where product_sku_id = p_alias_sku_id;

  return jsonb_build_object(
    'sales_moved', v_sales,
    'stock_rows', v_stock,
    'plans_moved', v_plans,
    'previous_canonical_sku_id',
      case
        when v_previous is null or v_previous = p_canonical_sku_id then null
        else v_previous
      end
  );
end;
$$;

revoke all on function public.apply_sku_alias(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_sku_alias(uuid, uuid) to service_role;

create or replace function public.clear_sku_alias(p_alias_sku_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sku_aliases
  where alias_sku_id = p_alias_sku_id;

  if not found then
    raise exception 'Alias was not found.';
  end if;
end;
$$;

revoke all on function public.clear_sku_alias(uuid) from public, anon, authenticated;
grant execute on function public.clear_sku_alias(uuid) to service_role;

-- Monthly actuals follow the canonical SKU when a sale is still stored on an alias.
create or replace function public.get_sop_monthly_actuals(
  p_start date,
  p_end date
)
returns table (
  sku_id uuid,
  channel_id uuid,
  sale_year integer,
  sale_month integer,
  qty numeric,
  net_sales numeric
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sa.canonical_sku_id, sr.sku_id) as sku_id,
    sr.channel_id,
    extract(year from sr.sale_date)::integer as sale_year,
    extract(month from sr.sale_date)::integer as sale_month,
    sum(sr.qty_sold)::numeric as qty,
    sum(sr.net_sales)::numeric as net_sales
  from public.sales_records sr
  left join public.sku_aliases sa on sa.alias_sku_id = sr.sku_id
  where sr.sale_date >= p_start
    and sr.sale_date <= p_end
  group by
    coalesce(sa.canonical_sku_id, sr.sku_id),
    sr.channel_id,
    extract(year from sr.sale_date),
    extract(month from sr.sale_date);
$$;

comment on function public.get_sop_monthly_actuals(date, date) is
  'Monthly qty/net_sales by canonical SKU and channel. Alias sales roll onto the regular SKU. Bundle explosion is applied in S&OP UI, not here.';

create or replace function public.get_sop_stock_by_sku_json()
returns jsonb
language sql
stable
set search_path = public
as $$
  with latest as (
    select max(as_of_date) as as_of_date
    from public.stock_levels
    where location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('sku_id', s.sku_id, 'qty', s.qty)),
    '[]'::jsonb
  )
  from (
    select
      coalesce(sa.canonical_sku_id, sl.sku_id) as sku_id,
      sum(sl.qty_on_hand)::numeric as qty
    from public.stock_levels sl
    left join public.sku_aliases sa on sa.alias_sku_id = sl.sku_id
    join latest on sl.as_of_date = latest.as_of_date
    where sl.location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
    group by coalesce(sa.canonical_sku_id, sl.sku_id)
  ) s;
$$;

create or replace function public.get_on_order_qty_by_sku()
returns table (
  sku_id uuid,
  sku_code text,
  on_order_qty numeric
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sa.canonical_sku_id, pol.sku_id) as sku_id,
    canon.sku_code,
    sum(pol.qty_ordered - pol.qty_received) as on_order_qty
  from public.purchase_order_lines pol
  join public.purchase_orders po on po.id = pol.po_id
  left join public.sku_aliases sa on sa.alias_sku_id = pol.sku_id
  join public.skus canon
    on canon.id = coalesce(sa.canonical_sku_id, pol.sku_id)
  where po.status in ('planned', 'ordered', 'in_production', 'in_transit')
    and pol.is_closed = false
    and pol.qty_ordered > pol.qty_received
  group by coalesce(sa.canonical_sku_id, pol.sku_id), canon.sku_code
  having sum(pol.qty_ordered - pol.qty_received) > 0;
$$;

create or replace function public.get_sku_forecast_base(
  p_history_days integer default 90,
  p_ewma_days integer default 30
)
returns table (
  sku_code text,
  franchise_name text,
  qty_on_hand numeric,
  stock_as_of date,
  history_days integer,
  demand_start_date date,
  first_sale_date date,
  demand_qtys numeric[]
)
language sql
stable
set search_path = public
as $$
  with month_bounds as (
    select
      date_trunc('month', current_date)::date as current_month_start,
      (date_trunc('month', current_date) - interval '24 months')::date as demand_start,
      (date_trunc('month', current_date) - interval '1 day')::date as demand_end
  ),
  latest_stock_date as (
    select coalesce(max(sl.as_of_date), current_date) as d
    from public.stock_levels sl
    where sl.location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
  ),
  window_bounds as (
    select
      ls.d as stock_as_of,
      mb.demand_start,
      mb.demand_end
    from latest_stock_date ls
    cross join month_bounds mb
  ),
  resolved_sales as (
    select
      coalesce(sa.canonical_sku_id, sr.sku_id) as sku_id,
      sr.sale_date,
      sr.qty_sold
    from public.sales_records sr
    left join public.sku_aliases sa on sa.alias_sku_id = sr.sku_id
  ),
  resolved_stock as (
    select
      coalesce(sa.canonical_sku_id, sl.sku_id) as sku_id,
      sl.location,
      sl.as_of_date,
      sl.qty_on_hand
    from public.stock_levels sl
    left join public.sku_aliases sa on sa.alias_sku_id = sl.sku_id
  ),
  mapped_skus as (
    select s.id, s.sku_code, pf.name as franchise_name
    from public.skus s
    join public.product_franchises pf on pf.id = s.franchise_id
    where s.is_bundle = false
      and s.is_packaging = false
      and s.is_extract = false
      and s.franchise_id is not null
      and s.is_active = true
      and not exists (
        select 1
        from public.sku_aliases sa
        where sa.alias_sku_id = s.id
      )
  ),
  first_sales as (
    select
      expanded.sku_code,
      min(expanded.sale_date) as first_sale_date
    from (
      select ms.sku_code, sr.sale_date
      from resolved_sales sr
      join mapped_skus ms on ms.id = sr.sku_id
      where sr.qty_sold > 0

      union all

      select
        ms.sku_code,
        sr.sale_date
      from resolved_sales sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      join mapped_skus ms on ms.id = bc.component_sku_id
      where sr.qty_sold * bc.qty_per_bundle > 0
    ) expanded
    group by expanded.sku_code
  ),
  daily as (
    select
      expanded.sku_code,
      expanded.sale_date,
      sum(expanded.qty_sold)::numeric as qty
    from (
      select
        ms.sku_code,
        sr.sale_date,
        sr.qty_sold
      from resolved_sales sr
      join mapped_skus ms on ms.id = sr.sku_id
      cross join window_bounds wb
      where sr.sale_date between wb.demand_start and wb.demand_end

      union all

      select
        ms.sku_code,
        sr.sale_date,
        sr.qty_sold * bc.qty_per_bundle as qty_sold
      from resolved_sales sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      join mapped_skus ms on ms.id = bc.component_sku_id
      cross join window_bounds wb
      where sr.sale_date between wb.demand_start and wb.demand_end
    ) expanded
    group by expanded.sku_code, expanded.sale_date
  ),
  history_counts as (
    select
      sku_code,
      count(*)::integer as history_days
    from daily
    where qty > 0
    group by sku_code
  ),
  stock_by_sku as (
    select
      ms.sku_code,
      ms.franchise_name,
      coalesce(sum(sl.qty_on_hand), 0) as qty_on_hand,
      wb.stock_as_of
    from mapped_skus ms
    cross join window_bounds wb
    left join resolved_stock sl
      on sl.sku_id = ms.id
      and sl.as_of_date = wb.stock_as_of
      and sl.location in (
        'Gudang Finished Goods',
        'Gudang Inventory',
        'Gudang Inventory Offline'
      )
    group by ms.sku_code, ms.franchise_name, wb.stock_as_of
  ),
  active_skus as (
    select sku_code from stock_by_sku where qty_on_hand <> 0
    union
    select distinct sku_code from daily
  ),
  demand_series as (
    select
      a.sku_code,
      wb.demand_start,
      array_agg(coalesce(d.qty, 0) order by gs.sale_date) as demand_qtys
    from active_skus a
    cross join window_bounds wb
    cross join lateral (
      select generate_series(
        wb.demand_start,
        wb.demand_end,
        interval '1 day'
      )::date as sale_date
    ) gs
    left join daily d
      on d.sku_code = a.sku_code and d.sale_date = gs.sale_date
    group by a.sku_code, wb.demand_start
  )
  select
    st.sku_code,
    st.franchise_name,
    st.qty_on_hand,
    st.stock_as_of,
    coalesce(hc.history_days, 0) as history_days,
    ds.demand_start as demand_start_date,
    fs.first_sale_date,
    coalesce(ds.demand_qtys, array[]::numeric[]) as demand_qtys
  from stock_by_sku st
  inner join active_skus a on a.sku_code = st.sku_code
  left join demand_series ds on ds.sku_code = st.sku_code
  left join history_counts hc on hc.sku_code = st.sku_code
  left join first_sales fs on fs.sku_code = st.sku_code
  order by st.qty_on_hand asc, st.sku_code;
$$;

-- New-product stock should not list a pre-order code as its own SKU.
create or replace function public.get_npd_stock_skus()
returns table (
  sku_code text,
  sku_name text,
  franchise_name text,
  qty_on_hand numeric,
  stock_as_of date
)
language sql
stable
set search_path = public
as $$
  with latest_stock_date as (
    select coalesce(max(sl.as_of_date), current_date) as d
    from public.stock_levels sl
    where sl.location in (
      'Gudang Finished Goods',
      'Gudang Inventory',
      'Gudang Inventory Offline'
    )
  ),
  stock_by_sku as (
    select
      coalesce(sa.canonical_sku_id, sl.sku_id) as sku_id,
      coalesce(sum(sl.qty_on_hand), 0) as qty_on_hand
    from public.stock_levels sl
    left join public.sku_aliases sa on sa.alias_sku_id = sl.sku_id
    cross join latest_stock_date lsd
    where sl.as_of_date = lsd.d
      and sl.location in (
        'Gudang Finished Goods',
        'Gudang Inventory',
        'Gudang Inventory Offline'
      )
    group by coalesce(sa.canonical_sku_id, sl.sku_id)
    having coalesce(sum(sl.qty_on_hand), 0) > 0
  ),
  open_po_skus as (
    select distinct coalesce(sa.canonical_sku_id, pol.sku_id) as sku_id
    from public.purchase_order_lines pol
    join public.purchase_orders po on po.id = pol.po_id
    left join public.sku_aliases sa on sa.alias_sku_id = pol.sku_id
    where po.status in ('planned', 'ordered', 'in_production', 'in_transit')
      and (pol.qty_ordered - pol.qty_received) > 0
  ),
  candidate_ids as (
    select sku_id from stock_by_sku
    union
    select sku_id from open_po_skus
  )
  select
    s.sku_code,
    s.name as sku_name,
    pf.name as franchise_name,
    coalesce(sbs.qty_on_hand, 0) as qty_on_hand,
    lsd.d as stock_as_of
  from candidate_ids c
  join public.skus s on s.id = c.sku_id
  cross join latest_stock_date lsd
  left join public.product_franchises pf on pf.id = s.franchise_id
  left join stock_by_sku sbs on sbs.sku_id = c.sku_id
  where s.is_bundle = false
    and s.is_packaging = false
    and s.is_extract = false
    and not exists (
      select 1 from public.sku_aliases sa where sa.alias_sku_id = s.id
    )
    and not exists (
      select 1
      from public.sales_records sr
      left join public.sku_aliases sa on sa.alias_sku_id = sr.sku_id
      where coalesce(sa.canonical_sku_id, sr.sku_id) = s.id
    )
    and not exists (
      select 1
      from public.sales_records sr
      join public.skus bs on bs.id = sr.sku_id and bs.is_bundle = true
      join public.bundle_components bc on bc.bundle_sku_id = bs.id
      left join public.sku_aliases sa on sa.alias_sku_id = bc.component_sku_id
      where coalesce(sa.canonical_sku_id, bc.component_sku_id) = s.id
    )
  order by qty_on_hand desc, s.sku_code;
$$;
