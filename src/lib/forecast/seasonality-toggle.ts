import { addDays, format } from "date-fns";
import { projectSkuPipelineCoverage } from "@/lib/forecast/batch-coverage";
import { assignVelocityClasses } from "@/lib/forecast/demand";
import type { RestockRecommendation } from "@/types/database";

function recomputeWithoutSeasonality(
  row: RestockRecommendation,
): RestockRecommendation {
  const dailyBurn = row.base_forecast_daily_demand;

  if (dailyBurn <= 0) {
    return {
      ...row,
      forecast_daily_demand: 0,
      safety_stock: 0,
      reorder_point: 0,
      days_until_stockout: null,
      projected_stockout_date: null,
      needs_reorder: false,
      covered_by_po: row.on_order_qty > 0,
      recommended_restock_qty: 0,
      has_stockout_gap: false,
      incoming_batch_stockout_date: null,
    };
  }

  const effectiveStock = row.current_stock + row.on_order_qty;
  const targetStockDays =
    row.forecast_daily_demand > 0
      ? row.recommended_restock_qty / row.forecast_daily_demand
      : 0;
  const safetyStockDays =
    row.forecast_daily_demand > 0
      ? row.safety_stock / row.forecast_daily_demand
      : Math.max(0, row.reorder_lead_days - row.lead_time_days);

  const safetyStock = dailyBurn * safetyStockDays;
  const reorderPoint = dailyBurn * row.reorder_lead_days;
  const daysUntilStockout = Math.floor(row.current_stock / dailyBurn);
  const projectedStockoutDate = format(
    addDays(new Date(), daysUntilStockout),
    "yyyy-MM-dd",
  );
  const needsReorder = effectiveStock <= reorderPoint;
  const recommendedRestockQty = Math.ceil(dailyBurn * targetStockDays);
  const coveredByPo = row.on_order_qty > 0 && !needsReorder;

  let incomingBatchStockoutDate: string | null = null;
  if (row.incoming_batch_arrival_date && row.on_order_qty > 0) {
    const pipeline = projectSkuPipelineCoverage(
      row.current_stock,
      dailyBurn,
      reorderPoint,
      [
        {
          arrivalDate: row.incoming_batch_arrival_date,
          qty: row.on_order_qty,
          lineId: "__latest",
        },
      ],
    );
    incomingBatchStockoutDate =
      pipeline.batch_depletion_by_line.get("__latest") ?? null;
  }

  const hasStockoutGap =
    row.earliest_incoming_batch_date != null &&
    projectedStockoutDate < row.earliest_incoming_batch_date;

  return {
    ...row,
    forecast_daily_demand: Number(dailyBurn.toFixed(2)),
    safety_stock: Number(safetyStock.toFixed(2)),
    reorder_point: Number(reorderPoint.toFixed(2)),
    days_until_stockout: daysUntilStockout,
    projected_stockout_date: projectedStockoutDate,
    needs_reorder: needsReorder,
    covered_by_po: coveredByPo,
    recommended_restock_qty: recommendedRestockQty,
    has_stockout_gap: hasStockoutGap,
    incoming_batch_stockout_date: incomingBatchStockoutDate,
  };
}

/** Recompute restock metrics from base Fcst/day when seasonality is disabled. */
export function applySeasonalityToggle(
  recommendations: RestockRecommendation[],
  seasonalityEnabled: boolean,
): RestockRecommendation[] {
  if (seasonalityEnabled) return recommendations;
  return assignVelocityClasses(recommendations.map(recomputeWithoutSeasonality));
}
