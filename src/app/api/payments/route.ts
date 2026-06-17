import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import {
  computePaymentDashboardSummary,
  listPaymentLedger,
  type PaymentLedgerSortKey,
} from "@/lib/db/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

const SORT_KEYS: PaymentLedgerSortKey[] = [
  "payment_date",
  "amount_idr",
  "po_number",
  "purpose",
  "payment_request_number",
];

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get("sort");
    const sortDirParam = searchParams.get("sort_dir");
    const includeSummary = searchParams.get("summary") !== "0";

    const supabase = createAdminClient();
    const [payments, summary] = await Promise.all([
      listPaymentLedger(supabase, {
        search: searchParams.get("search") ?? undefined,
        purpose: searchParams.get("purpose") ?? undefined,
        month: searchParams.get("month") ?? undefined,
        sort:
          sortParam && SORT_KEYS.includes(sortParam as PaymentLedgerSortKey)
            ? (sortParam as PaymentLedgerSortKey)
            : undefined,
        sortDir: sortDirParam === "asc" ? "asc" : "desc",
      }),
      includeSummary
        ? computePaymentDashboardSummary(supabase)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({ payments, summary });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
