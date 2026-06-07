import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listFinishedGoodSkus } from "@/lib/db/product-packaging";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const supabase = createAdminClient();
    const products = await listFinishedGoodSkus(supabase);
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
