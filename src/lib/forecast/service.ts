import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRestockPlanFromSeries,
  DAYS_PER_MONTH,
  DEFAULT_LEAD_TIME_MONTHS,
  DEFAULT_SAFETY_STOCK_MONTHS,
  DEFAULT_TARGET_STOCK_MONTHS,
  type SkuForecastInput,
} from "@/lib/forecast/demand";
import { enrichWithIncomingBatchStockout } from "@/lib/forecast/pipeline-stockout";
import type { RestockRecommendation } from "@/types/database";

export interface ForecastParams {
  leadTimeDays?: number;
  safetyStockMonths?: number;
  targetStockMonths?: number;
  historyDays?: number;
  ewmaDays?: number;
}

/**
 * Shared forecast loader used by the inventory API and the dashboard overview.
 * Pulls per-SKU demand series + stock from Postgres, nets in open-PO quantity,
 * and returns the ranked restock plan.
 */
export async function loadRestockRecommendationsUncached(
  supabase: SupabaseClient,
  params: ForecastParams = {},
): Promise<{ recommendations: RestockRecommendation[]; skuCount: number }> {
  const leadTimeDays =
    params.leadTimeDays ?? DEFAULT_LEAD_TIME_MONTHS * DAYS_PER_MONTH;
  const safetyStockMonths =
    params.safetyStockMonths ?? DEFAULT_SAFETY_STOCK_MONTHS;
  const targetStockMonths =
    params.targetStockMonths ?? DEFAULT_TARGET_STOCK_MONTHS;
  const historyDays = params.historyDays ?? 90;
  const ewmaDays = params.ewmaDays ?? 30;

  const [{ data, error }, onOrderRes] = await Promise.all([
    supabase.rpc("get_sku_forecast_base", {
      p_history_days: historyDays,
      p_ewma_days: ewmaDays,
    }),
    supabase.rpc("get_on_order_qty_by_sku"),
  ]);
  if (error) throw error;
  if (onOrderRes.error) throw onOrderRes.error;

  const inputs: SkuForecastInput[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      sku_code: String(row.sku_code),
      franchise_name: row.franchise_name ? String(row.franchise_name) : null,
      qty_on_hand: Number(row.qty_on_hand),
      stock_as_of: row.stock_as_of ? String(row.stock_as_of) : null,
      history_days: Number(row.history_days ?? 0),
      demand_start_date: row.demand_start_date
        ? String(row.demand_start_date)
        : null,
      first_sale_date: row.first_sale_date
        ? String(row.first_sale_date)
        : null,
      demand_qtys: (row.demand_qtys as number[] | null)?.map(Number) ?? [],
    }),
  );

  const onOrderBySku = new Map<string, number>();
  for (const row of (onOrderRes.data ?? []) as Record<string, unknown>[]) {
    onOrderBySku.set(String(row.sku_code), Number(row.on_order_qty));
  }

  const plan = buildRestockPlanFromSeries(
    inputs,
    { leadTimeDays, safetyStockMonths, targetStockMonths },
    onOrderBySku,
  );

  const recommendations = await enrichWithIncomingBatchStockout(supabase, plan);

  return { recommendations, skuCount: inputs.length };
}

export async function loadRestockRecommendations(
  _supabase: SupabaseClient,
  params: ForecastParams = {},
): Promise<{ recommendations: RestockRecommendation[]; skuCount: number }> {
  const { getCachedRestockRecommendations } = await import(
    "@/lib/forecast/cache"
  );
  return getCachedRestockRecommendations(params)();
}
