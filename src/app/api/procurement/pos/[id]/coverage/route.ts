import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { computePoCoverage } from "@/lib/forecast/po-coverage";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const lines = await computePoCoverage(supabase, purchaseOrder);
    return NextResponse.json({
      coverage: lines,
      requires_expected_date: !purchaseOrder.expected_date,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
