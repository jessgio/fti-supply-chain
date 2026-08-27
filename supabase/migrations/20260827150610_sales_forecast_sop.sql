-- Commercial S&OP forecast: Online/Offline channel groups, monthly targets,
-- SKU (single + bundle) month plans, CSV upload batches, and stock alerts.

create type public.sop_channel_group as enum ('online', 'offline');

alter table public.sales_channels
  add column if not exists sop_group public.sop_channel_group;

comment on column public.sales_channels.sop_group is
  'Maps a WMS sales channel to the Online or Offline S&OP workspace.';

create table public.sop_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  sop_group public.sop_channel_group not null,
  target_net_sales_post_tax numeric(16, 2) not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (year, month, sop_group)
);

create table public.sop_forecast_uploads (
  id uuid primary key default gen_random_uuid(),
  sop_group public.sop_channel_group not null,
  year integer not null,
  filename text not null,
  row_count integer not null default 0,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index sop_forecast_uploads_group_year_idx
  on public.sop_forecast_uploads (sop_group, year, created_at desc);

create table public.sop_sku_month_plans (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  sop_group public.sop_channel_group not null,
  sku_id uuid not null references public.skus (id) on delete cascade,
  projected_qty numeric(14, 4) not null default 0,
  avg_discount_pct numeric(6, 2) not null default 0
    check (avg_discount_pct >= 0 and avg_discount_pct <= 100),
  upload_id uuid references public.sop_forecast_uploads (id) on delete cascade,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (year, month, sop_group, sku_id)
);

create index sop_sku_month_plans_group_year_idx
  on public.sop_sku_month_plans (sop_group, year, sku_id);

alter table public.sop_monthly_targets enable row level security;
alter table public.sop_forecast_uploads enable row level security;
alter table public.sop_sku_month_plans enable row level security;

create policy "authenticated read sop_monthly_targets"
  on public.sop_monthly_targets for select to authenticated using (true);
create policy "commercial write sop_monthly_targets"
  on public.sop_monthly_targets for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'))
  with check (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'));

create policy "authenticated read sop_forecast_uploads"
  on public.sop_forecast_uploads for select to authenticated using (true);
create policy "commercial write sop_forecast_uploads"
  on public.sop_forecast_uploads for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'))
  with check (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'));

create policy "authenticated read sop_sku_month_plans"
  on public.sop_sku_month_plans for select to authenticated using (true);
create policy "commercial write sop_sku_month_plans"
  on public.sop_sku_month_plans for all to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'))
  with check (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'));

-- Notifications: allow system-style sales-forecast stock alerts.
alter type public.user_notification_source add value if not exists 'sales_forecast_stock';

alter table public.user_notifications
  alter column actor_id drop not null;

alter table public.user_notifications
  alter column status_update_id drop not null;

alter table public.user_notifications
  alter column source_id type text using source_id::text;

alter table public.user_notifications
  add column if not exists link_path text;

create policy "commercial update sales_channels"
  on public.sales_channels for update to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'))
  with check (public.current_user_role() in ('admin', 'supply_chain', 'sales_marketing'));
