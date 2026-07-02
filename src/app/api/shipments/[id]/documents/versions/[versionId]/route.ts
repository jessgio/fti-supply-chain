import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  getShipmentDocumentSummaries,
  updateShipmentDocumentVersionStatus,
} from "@/lib/db/shipment-documents";
import { getShipment } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { isShipmentDocumentVersionStatus } from "@/lib/shipments/document-types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id, versionId } = await params;
    const body = await request.json();
    const status = body?.status?.toString();

    if (!isShipmentDocumentVersionStatus(status)) {
      return NextResponse.json(
        { error: "status must be draft or final." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const shipment = await getShipment(supabase, id);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    }
    if (shipment.status === "closed") {
      return NextResponse.json(
        { error: "Cannot edit documents on a closed shipment." },
        { status: 400 },
      );
    }

    const version = await updateShipmentDocumentVersionStatus(
      supabase,
      versionId,
      status,
    );
    if (version.shipment_id !== id) {
      return NextResponse.json(
        { error: "Document version does not belong to this shipment." },
        { status: 400 },
      );
    }

    const summaries = await getShipmentDocumentSummaries(supabase, id);
    return NextResponse.json({ version, summaries });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
