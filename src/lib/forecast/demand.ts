import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type {
  DemandPattern,
  ForecastInsight,
  RestockRecommendation,
  VelocityClass,
} from "@/types/database";
import { computeSeasonalUplift } from "@/lib/forecast/seasonality";

interface DemandPoint {
  date: string;
  qty: number;
}

interface StockSnapshot {
  sku_code: string;
  franchise_name: string | null;
  qty_on_hand: number;
  as_of_date: string;
}

/** Calendar month length for inventory planning (3 mo lead time → 90 days). */
export const DAYS_PER_MONTH = 30;

/** Production + shipping lead time for a restock batch. */
export const DEFAULT_LEAD_TIME_MONTHS = 3;
/**
 * Buffer kept on the shelf when a batch lands. Reorder point = lead time +
 * safety, so a 1-month buffer means we reorder 4 months before the projected
 * stockout and the batch arrives ~1 month before the shelf would empty.
 */
export const DEFAULT_SAFETY_STOCK_MONTHS = 1;
/** Size of a single restock batch (4–5 months of cover; midpoint 4.5). */
export const DEFAULT_TARGET_STOCK_MONTHS = 4.5;
/** SKUs launched within this many calendar months are tagged NPD, not volatile. */
export const NPD_LAUNCH_MONTHS = 3;
/** Coefficient of variation above this on completed monthly sales → volatile. */
export const VOLATILE_CV_THRESHOLD = 0.45;

interface ForecastOptions {
  leadTimeDays?: number;
  safetyStockMonths?: number;
  targetStockMonths?: number;
}

function monthsToDays(months: number): number {
  return months * DAYS_PER_MONTH;
}

/** Completed calendar months only — current month is excluded. */
export function getCompletedMonthBounds(referenceDate = new Date()) {
  const currentMonthStart = startOfMonth(referenceDate);
  const l6mEnd = subDays(currentMonthStart, 1);
  const l6mStart = startOfMonth(subMonths(currentMonthStart, 6));
  const l3mStart = startOfMonth(subMonths(currentMonthStart, 3));
  return {
    l3mStart: format(l3mStart, "yyyy-MM-dd"),
    l6mStart: format(l6mStart, "yyyy-MM-dd"),
    l6mEnd: format(l6mEnd, "yyyy-MM-dd"),
  };
}

/**
 * Average daily demand for a completed month window. New products that began
 * selling mid-window are averaged from their first sale date, not the full span.
 */
export function periodAvgDaily(
  points: DemandPoint[],
  periodStart: string,
  periodEnd: string,
): number {
  const salesInPeriod = points.filter(
    (p) => p.date >= periodStart && p.date <= periodEnd,
  );
  if (salesInPeriod.length === 0) return 0;

  const firstSaleDate = [...points]
    .filter((p) => p.qty > 0 && p.date <= periodEnd)
    .sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  if (!firstSaleDate) return 0;

  const effectiveStart =
    firstSaleDate > periodStart ? firstSaleDate : periodStart;
  const totalQty = salesInPeriod
    .filter((p) => p.date >= effectiveStart)
    .reduce((sum, p) => sum + p.qty, 0);
  const dayCount =
    differenceInCalendarDays(parseISO(periodEnd), parseISO(effectiveStart)) + 1;
  return dayCount > 0 ? totalQty / dayCount : 0;
}

/** Blend of L3M and L6M daily averages (equal weight when both exist). */
export function computeForecastDaily(
  points: DemandPoint[],
  referenceDate = new Date(),
): { forecast: number; l3m: number; l6m: number } {
  const { l3mStart, l6mStart, l6mEnd } = getCompletedMonthBounds(referenceDate);
  const l3m = periodAvgDaily(points, l3mStart, l6mEnd);
  const l6m = periodAvgDaily(points, l6mStart, l6mEnd);

  let forecast = 0;
  if (l3m > 0 && l6m > 0) forecast = (l3m + l6m) / 2;
  else forecast = l3m || l6m;

  return { forecast, l3m, l6m };
}

function percentileAt(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.floor((sortedAsc.length - 1) * p);
  return sortedAsc[idx];
}

function classifyVelocity(
  demand: number,
  slowMax: number,
  fastMin: number,
  positiveCount: number,
): VelocityClass {
  if (demand <= 0) return "slow";
  if (positiveCount <= 1 || slowMax === fastMin) return "normal";
  if (demand >= fastMin) return "fast";
  if (demand <= slowMax) return "slow";
  return "normal";
}

/** Rank SKUs as fast / normal / slow from Fcst/day tertiles within each franchise. */
export function assignVelocityClasses(
  recs: RestockRecommendation[],
): RestockRecommendation[] {
  const groups = new Map<string, RestockRecommendation[]>();

  for (const rec of recs) {
    const key = rec.franchise_name ?? "__unmapped__";
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }

  const velocityBySku = new Map<string, VelocityClass>();

  for (const group of groups.values()) {
    const demands = group
      .map((r) => r.forecast_daily_demand)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    const slowMax = percentileAt(demands, 0.33);
    const fastMin = percentileAt(demands, 0.67);

    for (const rec of group) {
      velocityBySku.set(
        rec.sku_code,
        classifyVelocity(
          rec.forecast_daily_demand,
          slowMax,
          fastMin,
          demands.length,
        ),
      );
    }
  }

  return recs.map((rec) => ({
    ...rec,
    velocity_class: velocityBySku.get(rec.sku_code) ?? "slow",
  }));
}

function completedMonthlyTotals(
  points: DemandPoint[],
  l6mStart: string,
  l6mEnd: string,
  launchDate: string,
): number[] {
  const launchMonth = launchDate.slice(0, 7);
  const lastMonth = l6mEnd.slice(0, 7);
  const totals = new Map<string, number>();

  for (const point of points) {
    if (point.date < l6mStart || point.date > l6mEnd) continue;
    const month = point.date.slice(0, 7);
    if (month < launchMonth) continue;
    totals.set(month, (totals.get(month) ?? 0) + point.qty);
  }

  const months: number[] = [];
  let cursor = parseISO(`${launchMonth}-01`);
  const end = parseISO(`${lastMonth}-01`);
  while (cursor <= end) {
    months.push(totals.get(format(cursor, "yyyy-MM")) ?? 0);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean <= 0) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Classify demand as NPD, volatile, or steady from completed-month sales. */
export function classifyDemandPattern(
  points: DemandPoint[],
  firstSaleDate: string | null,
  referenceDate = new Date(),
): DemandPattern {
  if (!firstSaleDate) return "steady";

  const monthsSinceLaunch = differenceInCalendarMonths(
    referenceDate,
    parseISO(firstSaleDate),
  );
  if (monthsSinceLaunch < NPD_LAUNCH_MONTHS) return "npd";

  const { l6mStart, l6mEnd } = getCompletedMonthBounds(referenceDate);
  const monthly = completedMonthlyTotals(
    points,
    l6mStart,
    l6mEnd,
    firstSaleDate,
  );
  if (monthly.length < 2) return "steady";

  const cv = coefficientOfVariation(monthly);
  return cv >= VOLATILE_CV_THRESHOLD ? "volatile" : "steady";
}

export interface SkuForecastInput {
  sku_code: string;
  franchise_name: string | null;
  qty_on_hand: number;
  stock_as_of: string | null;
  history_days: number;
  demand_start_date: string | null;
  first_sale_date: string | null;
  demand_qtys: number[];
}

export function buildRestockPlanFromSeries(
  inputs: SkuForecastInput[],
  options: ForecastOptions = {},
  onOrderBySku: Map<string, number> = new Map(),
): RestockRecommendation[] {
  const demandBySku = new Map<string, DemandPoint[]>();
  const stockBySku = new Map<string, StockSnapshot>();

  for (const row of inputs) {
    const dates = buildDateSeries(row.demand_start_date, row.demand_qtys.length);
    demandBySku.set(
      row.sku_code,
      row.demand_qtys.map((qty, i) => ({ date: dates[i], qty })),
    );
    stockBySku.set(row.sku_code, {
      sku_code: row.sku_code,
      franchise_name: row.franchise_name,
      qty_on_hand: row.qty_on_hand,
      as_of_date: row.stock_as_of ?? format(new Date(), "yyyy-MM-dd"),
    });
  }

  const firstSaleBySku = new Map(
    inputs.map((row) => [row.sku_code, row.first_sale_date]),
  );

  const plan = buildRestockPlan(
    demandBySku,
    stockBySku,
    options,
    onOrderBySku,
    firstSaleBySku,
  );
  return plan;
}

function buildDateSeries(startDate: string | null, length: number): string[] {
  if (!startDate || length === 0) return [];
  const start = parseISO(startDate);
  return Array.from({ length }, (_, i) =>
    format(addDays(start, i), "yyyy-MM-dd"),
  );
}

export function buildRestockPlan(
  demandBySku: Map<string, DemandPoint[]>,
  stockBySku: Map<string, StockSnapshot>,
  options: ForecastOptions = {},
  onOrderBySku: Map<string, number> = new Map(),
  firstSaleBySku: Map<string, string | null> = new Map(),
): RestockRecommendation[] {
  const leadTimeDays =
    options.leadTimeDays ?? monthsToDays(DEFAULT_LEAD_TIME_MONTHS);
  const safetyStockDays = monthsToDays(
    options.safetyStockMonths ?? DEFAULT_SAFETY_STOCK_MONTHS,
  );
  const targetStockDays = monthsToDays(
    options.targetStockMonths ?? DEFAULT_TARGET_STOCK_MONTHS,
  );

  const recommendations: RestockRecommendation[] = [];

  for (const [skuCode, demand] of demandBySku) {
    const sorted = [...demand].sort((a, b) => a.date.localeCompare(b.date));
    const { forecast: baseForecastDaily, l3m, l6m } =
      computeForecastDaily(sorted);
    const stock = stockBySku.get(skuCode);
    const currentStock = stock?.qty_on_hand ?? 0;
    const onOrderQty = onOrderBySku.get(skuCode) ?? 0;
    const reorderLeadDays = leadTimeDays + safetyStockDays;
    const { multiplier: seasonalMultiplier, reasons: seasonalUpliftReasons } =
      computeSeasonalUplift(sorted, new Date(), reorderLeadDays);
    const forecastDaily = baseForecastDaily * seasonalMultiplier;
    // Effective availability nets in stock already on order so we do not
    // re-recommend a restock that has been raised but not yet received.
    const effectiveStock = currentStock + onOrderQty;
    const dailyBurn = forecastDaily;
    const safetyStock = dailyBurn * safetyStockDays;
    // Reorder this many days before the projected stockout: lead time plus the
    // safety buffer (e.g. 3 mo lead + 1 mo buffer = reorder 4 months out).
    const reorderPoint = dailyBurn * reorderLeadDays;
    // Stockout risk is driven by physical stock on hand — incoming POs reduce
    // the recommended order but do not change when the shelf physically empties.
    const daysUntilStockout =
      dailyBurn > 0 ? Math.floor(currentStock / dailyBurn) : null;
    const projectedStockoutDate =
      daysUntilStockout !== null
        ? format(addDays(new Date(), daysUntilStockout), "yyyy-MM-dd")
        : null;
    // Once inventory position (on hand + on order) falls to the reorder point,
    // order one full batch sized for the target months of cover. A fixed batch
    // matches how procurement actually buys (4–5 months at a time) rather than
    // topping up to a level barely above the reorder point.
    const needsReorder = dailyBurn > 0 && effectiveStock <= reorderPoint;
    const batchQty = dailyBurn * targetStockDays;
    // Always show the standard batch size for planning; needs_reorder gates PO actions.
    const recommendedRestockQty =
      dailyBurn > 0 ? Math.ceil(batchQty) : 0;
    const coveredByPo = onOrderQty > 0 && !needsReorder;

    const { l3mStart, l6mStart } = getCompletedMonthBounds();
    const firstSaleDate = firstSaleBySku.get(skuCode) ?? null;
    const demandPattern = classifyDemandPattern(sorted, firstSaleDate);
    let confidence: RestockRecommendation["confidence"] = "low";
    if (firstSaleDate && firstSaleDate <= l3mStart && l3m > 0 && l6m > 0) {
      confidence = "high";
    } else if (firstSaleDate && firstSaleDate <= l6mStart && (l3m > 0 || l6m > 0)) {
      confidence = "medium";
    }

    recommendations.push({
      sku_code: skuCode,
      franchise_name: stock?.franchise_name ?? null,
      demand_pattern: demandPattern,
      first_sale_date: firstSaleDate,
      current_stock: currentStock,
      on_order_qty: Number(onOrderQty.toFixed(2)),
      covered_by_po: coveredByPo,
      needs_reorder: needsReorder,
      avg_daily_demand: Number(l6m.toFixed(2)),
      base_forecast_daily_demand: Number(baseForecastDaily.toFixed(2)),
      forecast_daily_demand: Number(forecastDaily.toFixed(2)),
      seasonal_uplift_multiplier: Number(seasonalMultiplier.toFixed(3)),
      seasonal_uplift_reasons: seasonalUpliftReasons,
      days_until_stockout: daysUntilStockout,
      projected_stockout_date: projectedStockoutDate,
      earliest_incoming_batch_date: null,
      has_stockout_gap: false,
      incoming_batch_arrival_date: null,
      incoming_batch_stockout_date: null,
      recommended_restock_qty: recommendedRestockQty,
      reorder_point: Number(reorderPoint.toFixed(2)),
      safety_stock: Number(safetyStock.toFixed(2)),
      lead_time_days: leadTimeDays,
      reorder_lead_days: reorderLeadDays,
      confidence,
      velocity_class: "slow",
    });
  }

  return assignVelocityClasses(
    recommendations.sort((a, b) => {
      const aDays = a.days_until_stockout ?? 9999;
      const bDays = b.days_until_stockout ?? 9999;
      return aDays - bDays;
    }),
  );
}

export function buildRuleBasedInsight(
  recommendations: RestockRecommendation[],
): ForecastInsight {
  const urgent = recommendations.filter(
    (r) => r.needs_reorder && !r.covered_by_po,
  );
  const highDemand = [...recommendations]
    .sort((a, b) => b.forecast_daily_demand - a.forecast_daily_demand)
    .slice(0, 3);

  return {
    summary:
      urgent.length > 0
        ? `${urgent.length} SKU(s) are at or below their reorder point (${DEFAULT_LEAD_TIME_MONTHS}-month lead time + ${DEFAULT_SAFETY_STOCK_MONTHS}-month buffer). Prioritize replenishment for ${urgent
            .slice(0, 3)
            .map((r) => r.sku_code)
            .join(", ")}.`
        : `Stock levels look stable beyond the ${DEFAULT_LEAD_TIME_MONTHS + DEFAULT_SAFETY_STOCK_MONTHS}-month reorder window based on recent demand patterns.`,
    highlights: highDemand.map(
      (r) =>
        `${r.sku_code}: ~${r.forecast_daily_demand} units/day forecast; reorder point ${Math.ceil(r.reorder_point)} units.`,
    ),
    risks: urgent.map(
      (r) =>
        `${r.sku_code}: projected stockout ${r.projected_stockout_date ?? "soon"}; restock ${r.recommended_restock_qty} units.`,
    ),
  };
}

export async function buildAiInsight(
  recommendations: RestockRecommendation[],
): Promise<ForecastInsight> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buildRuleBasedInsight(recommendations);

  try {
    const { generateText } = await import("ai");
    const { getOpenAIProvider, resolveModelId } = await import(
      "@/lib/ai/provider"
    );
    const openai = getOpenAIProvider();

    const payload = recommendations.slice(0, 25).map((r) => ({
      sku: r.sku_code,
      franchise: r.franchise_name,
      stock: r.current_stock,
      forecast_daily: r.forecast_daily_demand,
      stockout_date: r.projected_stockout_date,
      restock_qty: r.recommended_restock_qty,
    }));

    const result = await generateText({
      model: openai(resolveModelId("gpt-4o-mini")),
      system:
        "You are a supply chain analyst for From This Island, a consumer brand. Return concise JSON with keys summary (string), highlights (string[]), risks (string[]). Focus on restocking priorities and demand risks.",
      prompt: `Analyze these SKU restock recommendations and return JSON only:\n${JSON.stringify(payload)}`,
    });

    const parsed = JSON.parse(result.text) as ForecastInsight;
    if (parsed.summary && Array.isArray(parsed.highlights)) return parsed;
  } catch {
    // fall through to rule-based
  }

  return buildRuleBasedInsight(recommendations);
}

export function groupDemandBySku(
  rows: { sale_date: string; sku_code: string; qty_sold: number }[],
): Map<string, DemandPoint[]> {
  const map = new Map<string, DemandPoint[]>();
  for (const row of rows) {
    const list = map.get(row.sku_code) ?? [];
    list.push({ date: row.sale_date, qty: row.qty_sold });
    map.set(row.sku_code, list);
  }
  return map;
}
