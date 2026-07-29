import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeFillingPoExtractShortfalls,
  type ExtractBalanceRef,
  type FillingOpenFgLine,
  type FillingPoExtractShortfall,
} from "@/lib/extracts/filling-po-extract-shortfall";
import { OPEN_PO_STATUSES } from "@/lib/procurement/open-po-value";
import { getFormulasBySkuIds } from "@/lib/db/product-extract-formulas";

type OpenFgLineRow = {
  id: string;
  sku_id: string;
  qty_ordered: number;
  qty_received: number;
  is_closed: boolean;
  skus: { sku_code: string; is_packaging: boolean } | null;
  purchase_orders: { id: string; status: string } | null;
};

type ExtractStatsRow = {
  extract_id: string;
  ending_balance: number;
};

export async function getFillingPoExtractShortfalls(
  supabase: SupabaseClient,
  poId: string,
): Promise<FillingPoExtractShortfall[]> {
  const { data, error } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, sku_id, qty_ordered, qty_received, is_closed, " +
        "skus!inner(sku_code, is_packaging), " +
        "purchase_orders!inner(id, status)",
    )
    .eq("skus.is_packaging", false)
    .in("purchase_orders.status", [...OPEN_PO_STATUSES]);
  if (error) throw error;

  const lines: FillingOpenFgLine[] = [];
  for (const row of (data ?? []) as unknown as OpenFgLineRow[]) {
    if (!row.purchase_orders) continue;
    if (row.is_closed) continue;
    if (row.skus?.is_packaging) continue;
    const openQty = Number(row.qty_ordered) - Number(row.qty_received);
    if (openQty <= 0) continue;
    lines.push({
      po_id: row.purchase_orders.id,
      sku_id: row.sku_id,
      open_qty: openQty,
    });
  }

  if (lines.length === 0) return [];

  const contributes = lines.some((line) => line.po_id === poId);
  if (!contributes) return [];

  const skuIds = [...new Set(lines.map((line) => line.sku_id))];
  const formulasBySku = await getFormulasBySkuIds(supabase, skuIds);
  if (formulasBySku.size === 0) return [];

  const extractIds = new Set<string>();
  for (const formulas of formulasBySku.values()) {
    for (const formula of formulas) {
      extractIds.add(formula.extract_id);
    }
  }
  if (extractIds.size === 0) return [];

  const { data: statsData, error: statsError } = await supabase.rpc(
    "get_extract_summaries",
  );
  if (statsError) throw statsError;

  const balances: ExtractBalanceRef[] = (
    (statsData ?? []) as ExtractStatsRow[]
  )
    .filter((row) => extractIds.has(row.extract_id))
    .map((row) => ({
      extract_id: row.extract_id,
      ending_balance: Number(row.ending_balance ?? 0),
    }));

  // Extracts with formulas but no ledger rows still need a zero balance entry.
  for (const extractId of extractIds) {
    if (!balances.some((b) => b.extract_id === extractId)) {
      balances.push({ extract_id: extractId, ending_balance: 0 });
    }
  }

  return computeFillingPoExtractShortfalls(
    lines,
    formulasBySku,
    balances,
    poId,
  );
}
