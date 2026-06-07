import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseOrder, receivePoLine } from "@/lib/db/procurement";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const lineId = body?.po_line_id as string | undefined;
    const qty = Number(body?.qty);

    if (!lineId || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "A line item and a positive quantity are required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    await receivePoLine(
      supabase,
      lineId,
      qty,
      body?.received_date ?? undefined,
      body?.location ?? undefined,
    );

    invalidateForecastCache();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
