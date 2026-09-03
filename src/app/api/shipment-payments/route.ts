import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listShipmentPaymentRows } from "@/lib/db/shipment-lark";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;
    const rows = await listShipmentPaymentRows(createAdminClient());
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
