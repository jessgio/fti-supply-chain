import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createPoDocumentSignedUpload,
  finalizePoDocumentUpload,
  listPoDocuments,
} from "@/lib/db/po-documents";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    if (!purchaseOrder) {
      return NextResponse.json(
        { error: "Purchase order not found." },
        { status: 404 },
      );
    }

    const documents = await listPoDocuments(supabase, id, "proforma_invoice");
    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    if (!purchaseOrder) {
      return NextResponse.json(
        { error: "Purchase order not found." },
        { status: 404 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phase = typeof body.phase === "string" ? body.phase : "";
    const fileName =
      typeof body.file_name === "string" ? body.file_name : "";
    const mimeType =
      typeof body.mime_type === "string" ? body.mime_type : null;
    const fileSize = Number(body.file_size);
    const documentType =
      typeof body.document_type === "string"
        ? body.document_type
        : "proforma_invoice";
    const notes = typeof body.notes === "string" ? body.notes : null;

    if (phase === "upload-url") {
      const signed = await createPoDocumentSignedUpload(
        supabase,
        id,
        documentType,
        fileName,
        mimeType,
        fileSize,
      );
      return NextResponse.json(signed);
    }

    if (phase === "complete") {
      const storagePath =
        typeof body.storage_path === "string" ? body.storage_path : "";
      if (!storagePath) {
        return NextResponse.json(
          { error: "storage_path is required." },
          { status: 400 },
        );
      }
      const profile = await getCurrentProfile();
      const document = await finalizePoDocumentUpload(
        supabase,
        id,
        documentType,
        storagePath,
        fileName,
        mimeType,
        fileSize,
        profile?.id ?? null,
        notes,
      );
      return NextResponse.json({ document }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid upload phase." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
