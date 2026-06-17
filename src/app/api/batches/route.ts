import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import {
  listStockBatches,
  type StockBatchSortKey,
} from "@/lib/db/batches";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

const SORT_KEYS: StockBatchSortKey[] = [
  "expiry_date",
  "received_date",
  "sku_code",
  "qty_received",
  "location",
  "batch_code",
];

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get("sort");
    const sortDirParam = searchParams.get("sort_dir");

    const batches = await listStockBatches(createAdminClient(), {
      search: searchParams.get("search") ?? undefined,
      batchCode: searchParams.get("batch_code") ?? undefined,
      expiryFrom: searchParams.get("expiry_from") ?? undefined,
      expiryTo: searchParams.get("expiry_to") ?? undefined,
      batchInfoOnly: searchParams.get("batch_info_only") === "1",
      sort:
        sortParam && SORT_KEYS.includes(sortParam as StockBatchSortKey)
          ? (sortParam as StockBatchSortKey)
          : undefined,
      sortDir: sortDirParam === "desc" ? "desc" : "asc",
    });

    return NextResponse.json({ batches });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
