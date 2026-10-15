import type { SupabaseClient } from "@supabase/supabase-js";
import { listOpenPoBatchesBySkus } from "@/lib/db/procurement";
import {
  projectSkuPipelineCoverage,
  type IncomingBatch,
} from "@/lib/forecast/batch-coverage";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import type { PurchaseOrder } from "@/types/database";

export interface PoLineCoverage {
  line_id: string;
  sku_code: string;
  /** When this PO line's open qty is fully consumed (FIFO). */
  batch_depletion_date: string | null;
  /** When inventory hits reorder point after the latest incoming batch lands. */
  next_reorder_date: string | null;
  is_latest_batch: boolean;
  daily_burn: number | null;
}

export async function computePoCoverage(
  supabase: SupabaseClient,
  po: PurchaseOrder,
): Promise<PoLineCoverage[]> {
  const openLines = (po.lines ?? []).filter(
    (l) => l.qty_ordered - l.qty_received > 0,
  );
  if (openLines.length === 0) return [];

  const skuIds = [...new Set(openLines.map((l) => l.sku_id))];

  const [batches, { recommendations }] = await Promise.all([
    listOpenPoBatchesBySkus(supabase, skuIds),
    loadRestockRecommendations(supabase),
  ]);

  const recBySku = new Map(recommendations.map((r) => [r.sku_code, r]));

  const coverageBySku = new Map<
    string,
    ReturnType<typeof projectSkuPipelineCoverage>
  >();
  const batchesBySku = new Map<string, typeof batches>();

  for (const skuId of skuIds) {
    const skuBatches = batches.filter(
      (b) => b.sku_id === skuId && b.expected_date,
    );
    batchesBySku.set(skuId, skuBatches);
    if (skuBatches.length === 0) continue;

    const skuCode = skuBatches[0]?.sku_code ?? "";
    const rec = recBySku.get(skuCode);
    const dailyBurn = rec?.forecast_daily_demand ?? 0;
    if (dailyBurn <= 0) continue;

    const incoming: IncomingBatch[] = skuBatches.map((b) => ({
      arrivalDate: b.expected_date!,
      qty: b.open_qty,
      lineId: b.batch_key,
    }));

    coverageBySku.set(
      skuId,
      projectSkuPipelineCoverage(
        rec?.current_stock ?? 0,
        dailyBurn,
        rec?.reorder_point ?? 0,
        incoming,
      ),
    );
  }

  return openLines.map((line) => {
    const skuCode = line.sku_code ?? "";
    const rec = recBySku.get(skuCode);
    const pipeline = coverageBySku.get(line.sku_id);
    const dailyBurn = rec?.forecast_daily_demand ?? 0;
    const lineBatches = (batchesBySku.get(line.sku_id) ?? []).filter(
      (batch) => batch.line_id === line.id,
    );
    const batchDepletionDate = lineBatches.reduce<string | null>(
      (latest, batch) => {
        const date = pipeline?.batch_depletion_by_line.get(batch.batch_key);
        if (!date) return latest;
        return latest == null || date > latest ? date : latest;
      },
      null,
    );

    return {
      line_id: line.id,
      sku_code: skuCode,
      batch_depletion_date: batchDepletionDate,
      next_reorder_date: pipeline?.next_reorder_date ?? null,
      is_latest_batch: lineBatches.some(
        (batch) => batch.batch_key === pipeline?.latest_line_id,
      ),
      daily_burn: dailyBurn > 0 ? dailyBurn : null,
    };
  });
}
