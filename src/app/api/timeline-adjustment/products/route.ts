import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listTimelineProductOptions } from "@/lib/db/timeline-products";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const products = await listTimelineProductOptions(createAdminClient());
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
