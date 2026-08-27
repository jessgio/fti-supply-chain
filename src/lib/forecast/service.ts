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
import { applyClearanceToRecommendations } from "@/lib/forecast/stock-status";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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
 * and returns the ranked restock plan. Packaging and extract SKUs are
 * supplementary and excluded even if they were inbounded via procurement.
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

  const [{ data, error }, onOrderRes, skuFlags] = await Promise.all([
    supabase.rpc("get_sku_forecast_base", {
      p_history_days: historyDays,
      p_ewma_days: ewmaDays,
    }),
    supabase.rpc("get_on_order_qty_by_sku"),
    fetchAllRows<{
      sku_code: string;
      is_clearance: boolean;
      is_packaging: boolean;
      is_extract: boolean;
    }>(() =>
      supabase
        .from("skus")
        .select("sku_code, is_clearance, is_packaging, is_extract")
        .or("is_clearance.eq.true,is_packaging.eq.true,is_extract.eq.true"),
    ),
  ]);
  if (error) throw error;
  if (onOrderRes.error) throw onOrderRes.error;

  const supplementaryCodes = new Set<string>();
  const clearanceCodes: string[] = [];
  for (const row of skuFlags) {
    if (row.is_packaging || row.is_extract) {
      supplementaryCodes.add(row.sku_code);
    }
    if (row.is_clearance) clearanceCodes.push(row.sku_code);
  }

  const inputs: SkuForecastInput[] = (data ?? [])
    .map((row: Record<string, unknown>) => ({
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
    }))
    .filter((row: SkuForecastInput) => !supplementaryCodes.has(row.sku_code));

  const onOrderBySku = new Map<string, number>();
  for (const row of (onOrderRes.data ?? []) as Record<string, unknown>[]) {
    onOrderBySku.set(String(row.sku_code), Number(row.on_order_qty));
  }

  const plan = buildRestockPlanFromSeries(
    inputs,
    { leadTimeDays, safetyStockMonths, targetStockMonths },
    onOrderBySku,
  );

  const withBatches = await enrichWithIncomingBatchStockout(supabase, plan);
  const recommendations = applyClearanceToRecommendations(
    withBatches,
    clearanceCodes,
  );

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
