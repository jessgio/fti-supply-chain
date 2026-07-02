import { NextResponse } from "next/server";
import { getCurrentProfile, requireWriteRole } from "@/lib/auth";
import { uploadShipmentDocumentVersion } from "@/lib/db/shipment-documents";
import { getShipment } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import {
  isShipmentDocumentType,
  isShipmentDocumentVersionStatus,
} from "@/lib/shipments/document-types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  try {
    const denied = await requireWriteRole();
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

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const statusRaw = formData.get("status")?.toString() ?? "draft";
    if (!isShipmentDocumentVersionStatus(statusRaw)) {
      return NextResponse.json(
        { error: "Status must be draft or final." },
        { status: 400 },
      );
    }

    const notes = formData.get("notes")?.toString() ?? null;
    const profile = await getCurrentProfile();

    const version = await uploadShipmentDocumentVersion(
      supabase,
      id,
      type,
      file,
      statusRaw,
      profile?.id ?? null,
      notes,
    );

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
