import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPayablePurchaseOrders } from "@/lib/db/procurement";
import { listLatestInboundReceiveDateByPo } from "@/lib/db/inbound";
import { buildUnpaidPoRows } from "@/lib/procurement/unpaid-pos";
import { errorMessage } from "@/lib/errors";
import { requireReadRole } from "@/lib/auth";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const [purchaseOrders, inboundDates] = await Promise.all([
      listPayablePurchaseOrders(supabase),
      listLatestInboundReceiveDateByPo(supabase),
    ]);

    return NextResponse.json({
      rows: buildUnpaidPoRows(purchaseOrders, inboundDates),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
