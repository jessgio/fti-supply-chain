import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPurchaseOrders } from "@/lib/db/procurement";
import { formatPoMoney } from "@/lib/procurement/currencies";
import { computeOpenPoValueIdr } from "@/lib/procurement/open-po-value";
import { errorMessage } from "@/lib/errors";
import { requireReadRole } from "@/lib/auth";
import type { PoStatus } from "@/types/database";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as PoStatus | null;
    const supabase = createAdminClient();
    const purchaseOrders = await listPurchaseOrders(
      supabase,
      status ?? undefined,
    );
    const totalIdr = await computeOpenPoValueIdr(purchaseOrders);

    return NextResponse.json({
      totalIdr,
      formatted: formatPoMoney(totalIdr, "IDR"),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
