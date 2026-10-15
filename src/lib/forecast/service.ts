import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRestockPlanFromSeries,
  DAYS_PER_MONTH,
  DEFAULT_LEAD_TIME_MONTHS,
  DEFAULT_SAFETY_STOCK_MONTHS,
  DEFAULT_TARGET_STOCK_MONTHS,
  getCompletedMonthBounds,
  type SkuForecastInput,
} from "@/lib/forecast/demand";
import { enrichWithIncomingBatchStockout } from "@/lib/forecast/pipeline-stockout";
import { applyClearanceToRecommendations } from "@/lib/forecast/stock-status";
import { STOCK_AGGREGATE_LOCATIONS } from "@/lib/stock/locations";
import { fetchAllRpc, fetchAllRows } from "@/lib/supabase/fetch-all";
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
  const { l6mStart, l6mEnd } = getCompletedMonthBounds();

  const [data, onOrderRows, skuFlags, minOnHandBySku] = await Promise.all([
    fetchAllRpc<Record<string, unknown>>(supabase, "get_sku_forecast_base", {
      p_history_days: historyDays,
      p_ewma_days: ewmaDays,
    }),
    fetchAllRpc<{ sku_code: string; on_order_qty: number }>(
      supabase,
      "get_on_order_qty_by_sku",
      {},
    ),
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
    loadMinOnHandBySku(supabase, l6mStart, l6mEnd),
  ]);
  const supplementaryCodes = new Set<string>();
  const clearanceCodes: string[] = [];
  for (const row of skuFlags) {
    if (row.is_packaging || row.is_extract) {
      supplementaryCodes.add(row.sku_code);
    }
    if (row.is_clearance) clearanceCodes.push(row.sku_code);
  }

  const inputs: SkuForecastInput[] = data
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
      min_on_hand_by_month: Object.fromEntries(
        minOnHandBySku.get(String(row.sku_code)) ?? [],
      ),
    }))
    .filter((row: SkuForecastInput) => !supplementaryCodes.has(row.sku_code));

  const onOrderBySku = new Map<string, number>();
  for (const row of onOrderRows) {
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

/**
 * Lowest combined on-hand in the forecast warehouses for each completed month
 * that has a stock upload. Months with no snapshot are omitted.
 */
async function loadMinOnHandBySku(
  supabase: SupabaseClient,
  rangeStart: string,
  rangeEnd: string,
): Promise<Map<string, Map<string, number>>> {
  const [stockRows, aliasRows, skuRows] = await Promise.all([
    fetchAllRows<{
      sku_id: string;
      as_of_date: string;
      qty_on_hand: number;
    }>(() =>
      supabase
        .from("stock_levels")
        .select("sku_id, as_of_date, qty_on_hand")
        .in("location", [...STOCK_AGGREGATE_LOCATIONS])
        .gte("as_of_date", rangeStart)
        .lte("as_of_date", rangeEnd),
    ),
    fetchAllRows<{ alias_sku_id: string; canonical_sku_id: string }>(() =>
      supabase.from("sku_aliases").select("alias_sku_id, canonical_sku_id"),
    ),
    fetchAllRows<{ id: string; sku_code: string }>(() =>
      supabase.from("skus").select("id, sku_code"),
    ),
  ]);

  const canonicalIdByAlias = new Map(
    aliasRows.map((row) => [row.alias_sku_id, row.canonical_sku_id]),
  );
  const codeById = new Map(skuRows.map((row) => [row.id, row.sku_code]));
  const dailyQty = new Map<string, number>();

  for (const row of stockRows) {
    const skuId = canonicalIdByAlias.get(row.sku_id) ?? row.sku_id;
    const skuCode = codeById.get(skuId);
    if (!skuCode) continue;
    const date = String(row.as_of_date).slice(0, 10);
    const key = `${skuCode}|${date}`;
    dailyQty.set(key, (dailyQty.get(key) ?? 0) + Number(row.qty_on_hand));
  }

  const mins = new Map<string, Map<string, number>>();
  for (const [key, qty] of dailyQty) {
    const splitAt = key.lastIndexOf("|");
    const skuCode = key.slice(0, splitAt);
    const date = key.slice(splitAt + 1);
    const month = date.slice(0, 7);
    const byMonth = mins.get(skuCode) ?? new Map<string, number>();
    const previous = byMonth.get(month);
    if (previous === undefined || qty < previous) byMonth.set(month, qty);
    mins.set(skuCode, byMonth);
  }
  return mins;
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
