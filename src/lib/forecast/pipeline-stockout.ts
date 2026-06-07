import type { SupabaseClient } from "@supabase/supabase-js";
import { listOpenPoBatchesBySkus } from "@/lib/db/procurement";
import {
  projectSkuPipelineCoverage,
  type IncomingBatch,
} from "@/lib/forecast/batch-coverage";
import type { RestockRecommendation } from "@/types/database";

/**
 * When open POs exist, simulate FIFO depletion: current stock first, then each
 * incoming batch by expected arrival. Sets the latest batch's depletion date.
 */
export async function enrichWithIncomingBatchStockout(
  supabase: SupabaseClient,
  recommendations: RestockRecommendation[],
): Promise<RestockRecommendation[]> {
  if (recommendations.length === 0) return recommendations;

  const skuCodes = recommendations.map((r) => r.sku_code);
  const { data: skuRows, error: skuError } = await supabase
    .from("skus")
    .select("id, sku_code")
    .in("sku_code", skuCodes);
  if (skuError) throw skuError;

  const skuIds = (skuRows ?? []).map((row) => row.id as string);
  const batches = await listOpenPoBatchesBySkus(supabase, skuIds);

  const batchesBySkuCode = new Map<
    string,
    { line_id: string; open_qty: number; expected_date: string }[]
  >();
  for (const batch of batches) {
    if (!batch.expected_date) continue;
    const list = batchesBySkuCode.get(batch.sku_code) ?? [];
    list.push({
      line_id: batch.line_id,
      open_qty: batch.open_qty,
      expected_date: batch.expected_date,
    });
    batchesBySkuCode.set(batch.sku_code, list);
  }

  return recommendations.map((rec) => {
    const skuBatches = batchesBySkuCode.get(rec.sku_code);
    if (!skuBatches?.length || rec.forecast_daily_demand <= 0) {
      return {
        ...rec,
        incoming_batch_arrival_date: null,
        incoming_batch_stockout_date: null,
      };
    }

    const incoming: IncomingBatch[] = skuBatches.map((b) => ({
      arrivalDate: b.expected_date,
      qty: b.open_qty,
      lineId: b.line_id,
    }));

    const pipeline = projectSkuPipelineCoverage(
      rec.current_stock,
      rec.forecast_daily_demand,
      rec.reorder_point,
      incoming,
    );

    const latestLineId = pipeline.latest_line_id;
    const latestBatch = latestLineId
      ? skuBatches.find((b) => b.line_id === latestLineId)
      : null;

    return {
      ...rec,
      incoming_batch_arrival_date: latestBatch?.expected_date ?? null,
      incoming_batch_stockout_date: latestLineId
        ? (pipeline.batch_depletion_by_line.get(latestLineId) ?? null)
        : null,
    };
  });
}
