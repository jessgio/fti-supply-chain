import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listOngoingPosForTimeline } from "@/lib/db/inbound";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const purchase_orders = await listOngoingPosForTimeline(createAdminClient());
    return NextResponse.json({ purchase_orders });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
