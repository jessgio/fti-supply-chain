import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { getShipmentApContext } from "@/lib/db/shipment-lark";
import { listSuppliers } from "@/lib/db/procurement";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;
    const { id } = await params;
    const supabase = createAdminClient();
    const context = await getShipmentApContext(supabase, id);
    if (!context) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }
    const suppliers = await listSuppliers(supabase);
    return NextResponse.json({ ...context, suppliers });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
