import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";
import { requireReadRole } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    if (!purchaseOrder) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }

    return NextResponse.json({
      title: purchaseOrder.po_number,
      subtitle: purchaseOrder.supplier_name ?? undefined,
      lines: (purchaseOrder.lines ?? []).map((line) => ({
        sku_code: line.sku_code ?? "",
        sku_name: line.sku_name ?? null,
        quantity: line.qty_ordered,
        label:
          line.qty_received > 0
            ? `${line.qty_received.toLocaleString()} received`
            : undefined,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
