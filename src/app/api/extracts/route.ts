import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listExtracts } from "@/lib/db/extracts";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { ExtractSortKey } from "@/types/database";

const SORT_KEYS: ExtractSortKey[] = [
  "item_no",
  "description",
  "ending_balance",
  "total_received",
  "total_issued",
  "waste_pct",
  "txn_count",
  "last_date",
];

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get("sort");

    const extracts = await listExtracts(createAdminClient(), {
      search: searchParams.get("search") ?? undefined,
      sort:
        sortParam && SORT_KEYS.includes(sortParam as ExtractSortKey)
          ? (sortParam as ExtractSortKey)
          : undefined,
      sortDir: searchParams.get("sort_dir") === "desc" ? "desc" : "asc",
    });

    return NextResponse.json({ extracts });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
