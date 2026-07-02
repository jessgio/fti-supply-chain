import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listDocumentVersions } from "@/lib/db/shipment-documents";
import { getShipment } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { isShipmentDocumentType } from "@/lib/shipments/document-types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id, type } = await params;
    if (!isShipmentDocumentType(type)) {
      return NextResponse.json(
        { error: "Invalid document type." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const shipment = await getShipment(supabase, id);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    }

    const versions = await listDocumentVersions(supabase, id, type);
    return NextResponse.json({ versions });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
