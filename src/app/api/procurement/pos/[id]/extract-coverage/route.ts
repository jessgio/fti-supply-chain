import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { getFillingPoExtractShortfalls } from "@/lib/db/filling-po-extract-shortfall";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const shortfalls = await getFillingPoExtractShortfalls(supabase, id);
    return NextResponse.json({ shortfalls });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
