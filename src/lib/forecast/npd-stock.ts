import type { SupabaseClient } from "@supabase/supabase-js";
import { listOpenPoBatchesBySkus } from "@/lib/db/procurement";
import type { NpdStockRow } from "@/types/database";

/**
 * Upcoming NPDs: SKUs with physical stock in the forecast locations but no sales
 * yet. They are excluded from the demand forecast, so load them separately and
 * attach incoming PO batch info (qty + earliest arrival) for visibility.
 */
export async function loadNpdStockSkus(
  supabase: SupabaseClient,
): Promise<NpdStockRow[]> {
  const { data, error } = await supabase.rpc("get_npd_stock_skus");
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const skuCodes = rows.map((r) => String(r.sku_code));
  const { data: skuRows, error: skuError } = await supabase
    .from("skus")
    .select("id, sku_code")
    .in("sku_code", skuCodes);
  if (skuError) throw skuError;

  const idByCode = new Map<string, string>();
  for (const row of skuRows ?? []) {
    idByCode.set(row.sku_code as string, row.id as string);
  }

  const batches = await listOpenPoBatchesBySkus(
    supabase,
    [...idByCode.values()],
  );

  const batchInfoBySku = new Map<
    string,
    { incoming_qty: number; earliest: string | null; count: number }
  >();
  for (const batch of batches) {
    const info = batchInfoBySku.get(batch.sku_code) ?? {
      incoming_qty: 0,
      earliest: null,
      count: 0,
    };
    info.incoming_qty += batch.open_qty;
    info.count += 1;
    if (
      batch.expected_date &&
      (info.earliest === null || batch.expected_date < info.earliest)
    ) {
      info.earliest = batch.expected_date;
    }
    batchInfoBySku.set(batch.sku_code, info);
  }

  return rows.map((row) => {
    const skuCode = String(row.sku_code);
    const info = batchInfoBySku.get(skuCode);
    return {
      sku_code: skuCode,
      sku_name: row.sku_name ? String(row.sku_name) : null,
      franchise_name: row.franchise_name ? String(row.franchise_name) : null,
      qty_on_hand: Number(row.qty_on_hand ?? 0),
      stock_as_of: row.stock_as_of ? String(row.stock_as_of) : null,
      incoming_qty: info?.incoming_qty ?? 0,
      earliest_incoming_batch_date: info?.earliest ?? null,
      open_batch_count: info?.count ?? 0,
    };
  });
}
