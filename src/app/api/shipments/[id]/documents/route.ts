import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  getShipmentDocumentSummaries,
  getRequiredDocuments,
  setRequiredDocuments,
} from "@/lib/db/shipment-documents";
import { getShipment } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import {
  isShipmentDocumentType,
  type ShipmentDocumentType,
} from "@/lib/shipments/document-types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    const shipment = await getShipment(supabase, id);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    }

    const [required_documents, summaries] = await Promise.all([
      getRequiredDocuments(supabase, id),
      getShipmentDocumentSummaries(supabase, id),
    ]);

    return NextResponse.json({
      shipment,
      required_documents,
      summaries,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const raw = body?.required_documents;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "required_documents must be an array." },
        { status: 400 },
      );
    }

    const documentTypes: ShipmentDocumentType[] = [];
    for (const item of raw) {
      const value = String(item);
      if (!isShipmentDocumentType(value)) {
        return NextResponse.json(
          { error: `Invalid document type: ${value}` },
          { status: 400 },
        );
      }
      documentTypes.push(value);
    }

    const supabase = createAdminClient();
    const shipment = await getShipment(supabase, id);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    }

    await setRequiredDocuments(supabase, id, documentTypes);
    const [required_documents, summaries] = await Promise.all([
      getRequiredDocuments(supabase, id),
      getShipmentDocumentSummaries(supabase, id),
    ]);

    return NextResponse.json({ required_documents, summaries });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
