import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockBatch } from "@/types/database";

export type StockBatchSortKey =
  | "expiry_date"
  | "received_date"
  | "sku_code"
  | "qty_received"
  | "location"
  | "batch_code";

export interface ListStockBatchesParams {
  search?: string;
  batchCode?: string;
  expiryFrom?: string;
  expiryTo?: string;
  batchInfoOnly?: boolean;
  sort?: StockBatchSortKey;
  sortDir?: "asc" | "desc";
}

type ReceiptRow = {
  id: string;
  qty_received: number;
  received_date: string;
  location: string;
  batch_code: string | null;
  expiry_date: string | null;
  purchase_order_lines: {
    sku_id: string;
    skus: { sku_code: string; name: string | null } | null;
    purchase_orders: { po_number: string } | null;
  } | null;
};

function mapReceiptRow(row: ReceiptRow): StockBatch | null {
  const line = row.purchase_order_lines;
  if (!line) return null;
  return {
    id: row.id,
    sku_id: line.sku_id,
    sku_code: line.skus?.sku_code ?? "",
    sku_name: line.skus?.name ?? null,
    batch_code: row.batch_code,
    expiry_date: row.expiry_date,
    qty_received: Number(row.qty_received),
    location: row.location,
    received_date: row.received_date,
    po_number: line.purchase_orders?.po_number ?? null,
  };
}

function matchesSearch(batch: StockBatch, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if (batch.sku_code.toLowerCase().includes(q)) return true;
  if (batch.sku_name?.toLowerCase().includes(q)) return true;
  if (batch.batch_code?.toLowerCase().includes(q)) return true;
  if (batch.po_number?.toLowerCase().includes(q)) return true;
  return false;
}

function compareBatches(
  a: StockBatch,
  b: StockBatch,
  key: StockBatchSortKey,
  dir: "asc" | "desc",
): number {
  const sign = dir === "asc" ? 1 : -1;

  const compareNullable = (
    left: string | null | undefined,
    right: string | null | undefined,
  ) => {
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return left.localeCompare(right);
  };

  let cmp = 0;
  switch (key) {
    case "expiry_date":
      cmp = compareNullable(a.expiry_date, b.expiry_date);
      break;
    case "received_date":
      cmp = a.received_date.localeCompare(b.received_date);
      break;
    case "sku_code":
      cmp = a.sku_code.localeCompare(b.sku_code);
      break;
    case "qty_received":
      cmp = a.qty_received - b.qty_received;
      break;
    case "location":
      cmp = a.location.localeCompare(b.location);
      break;
    case "batch_code":
      cmp = compareNullable(a.batch_code, b.batch_code);
      break;
  }
  return cmp * sign;
}

export async function listStockBatches(
  supabase: SupabaseClient,
  params: ListStockBatchesParams = {},
): Promise<StockBatch[]> {
  const sort = params.sort ?? "expiry_date";
  const sortDir = params.sortDir ?? "asc";

  let query = supabase
    .from("po_receipts")
    .select(
      "id, qty_received, received_date, location, batch_code, expiry_date, " +
        "purchase_order_lines!inner(sku_id, skus(sku_code, name), purchase_orders(po_number))",
    );

  if (params.batchCode?.trim()) {
    query = query.ilike("batch_code", `%${params.batchCode.trim()}%`);
  }
  if (params.expiryFrom) {
    query = query.gte("expiry_date", params.expiryFrom);
  }
  if (params.expiryTo) {
    query = query.lte("expiry_date", params.expiryTo);
  }
  if (params.batchInfoOnly) {
    query = query.or("batch_code.not.is.null,expiry_date.not.is.null");
  }

  const { data, error } = await query;
  if (error) throw error;

  let batches = ((data ?? []) as unknown as ReceiptRow[])
    .map(mapReceiptRow)
    .filter((row): row is StockBatch => row !== null);

  if (params.search?.trim()) {
    batches = batches.filter((batch) => matchesSearch(batch, params.search!));
  }

  batches.sort((a, b) => compareBatches(a, b, sort, sortDir));
  return batches;
}
