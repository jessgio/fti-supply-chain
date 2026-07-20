import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import { listPoDocuments, uploadPoDocument } from "@/lib/db/po-documents";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { isPoDocumentType } from "@/lib/procurement/po-documents";

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

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const documentTypeRaw =
      formData.get("document_type")?.toString() ?? "proforma_invoice";
    if (!isPoDocumentType(documentTypeRaw)) {
      return NextResponse.json(
        { error: "Invalid document type." },
        { status: 400 },
      );
    }

    const notes = formData.get("notes")?.toString() ?? null;
    const profile = await getCurrentProfile();

    const document = await uploadPoDocument(
      supabase,
      id,
      documentTypeRaw,
      file,
      profile?.id ?? null,
      notes,
    );

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
