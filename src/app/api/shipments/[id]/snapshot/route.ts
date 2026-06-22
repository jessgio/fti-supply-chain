import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShipment } from "@/lib/db/shipments";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const shipment = await getShipment(createAdminClient(), id);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }

    const lines = (shipment.purchase_orders ?? []).flatMap((po) =>
      (po.items ?? []).map((item) => ({
        sku_code: item.sku_code ?? "",
        sku_name: item.sku_name ?? null,
        quantity: item.quantity,
        label: `PO ${po.po_number}`,
      })),
    );

    return NextResponse.json({
      title: shipment.shipment_number,
      subtitle: (shipment.purchase_orders ?? [])
        .map((po) => po.po_number)
        .join(", "),
      lines,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
