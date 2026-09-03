-- Queue for forecast CSV SKUs that are missing, inactive, or unclassified.
-- Known SKUs still upload; these wait for type / franchise / RSP confirmation.

create table public.sop_forecast_pending_skus (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  sop_group public.sop_channel_group not null,
  sku_code text not null,
  sku_id uuid references public.skus (id) on delete set null,
  reason text not null
    check (reason in ('missing', 'inactive', 'unclassified', 'packaging', 'extract')),
  suggested_sku_code text,
  name text,
  retail_price numeric(14, 2),
  is_bundle boolean not null default false,
  franchise_id uuid references public.product_franchises (id) on delete set null,
  upload_id uuid references public.sop_forecast_uploads (id) on delete set null,
  months jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (year, sop_group, sku_code)
);

create index sop_forecast_pending_skus_group_year_idx
  on public.sop_forecast_pending_skus (sop_group, year);

alter table public.sop_forecast_pending_skus enable row level security;

create policy "authenticated read sop_forecast_pending_skus"
  on public.sop_forecast_pending_skus for select to authenticated using (true);

create policy "commercial write sop_forecast_pending_skus"
  on public.sop_forecast_pending_skus for all to authenticated
  using (
    public.current_user_role() in (
      'admin', 'supply_chain', 'sales_marketing', 'viewer'
    )
  )
  with check (
    public.current_user_role() in (
      'admin', 'supply_chain', 'sales_marketing', 'viewer'
    )
  );
