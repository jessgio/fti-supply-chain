-- Allow every signed-in role (including viewer) to edit S&OP forecast data.

drop policy if exists "commercial write sop_monthly_targets"
  on public.sop_monthly_targets;
create policy "commercial write sop_monthly_targets"
  on public.sop_monthly_targets for all to authenticated
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

drop policy if exists "commercial write sop_forecast_uploads"
  on public.sop_forecast_uploads;
create policy "commercial write sop_forecast_uploads"
  on public.sop_forecast_uploads for all to authenticated
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

drop policy if exists "commercial write sop_sku_month_plans"
  on public.sop_sku_month_plans;
create policy "commercial write sop_sku_month_plans"
  on public.sop_sku_month_plans for all to authenticated
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

drop policy if exists "commercial write sop_sku_channel_inactive"
  on public.sop_sku_channel_inactive;
create policy "commercial write sop_sku_channel_inactive"
  on public.sop_sku_channel_inactive for all to authenticated
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

drop policy if exists "commercial update sales_channels"
  on public.sales_channels;
create policy "commercial update sales_channels"
  on public.sales_channels for update to authenticated
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

drop policy if exists "commercial write sku_retail_prices"
  on public.sku_retail_prices;
create policy "commercial write sku_retail_prices"
  on public.sku_retail_prices for all to authenticated
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
