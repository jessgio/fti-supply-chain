import type { RestockRecommendation } from "@/types/database";

export interface InsightFocusRow {
  row: RestockRecommendation;
  focus: Set<"risk" | "demand">;
}

/** SKUs highlighted in the insight view: urgent reorders plus top demand. */
export function buildInsightFocusRows(
  recommendations: RestockRecommendation[],
): InsightFocusRow[] {
  const urgent = recommendations.filter(
    (r) => r.needs_reorder && !r.covered_by_po,
  );
  const highDemand = [...recommendations]
    .sort((a, b) => b.forecast_daily_demand - a.forecast_daily_demand)
    .slice(0, 3);

  const bySku = new Map<string, InsightFocusRow>();

  for (const row of urgent) {
    const entry = bySku.get(row.sku_code) ?? {
      row,
      focus: new Set<"risk" | "demand">(),
    };
    entry.focus.add("risk");
    bySku.set(row.sku_code, entry);
  }

  for (const row of highDemand) {
    const entry = bySku.get(row.sku_code) ?? {
      row,
      focus: new Set<"risk" | "demand">(),
    };
    entry.focus.add("demand");
    bySku.set(row.sku_code, entry);
  }

  return [...bySku.values()].sort((a, b) => {
    const aRisk = a.focus.has("risk") ? 0 : 1;
    const bRisk = b.focus.has("risk") ? 0 : 1;
    if (aRisk !== bRisk) return aRisk - bRisk;
    return (
      (a.row.days_until_stockout ?? 9999) - (b.row.days_until_stockout ?? 9999)
    );
  });
}
