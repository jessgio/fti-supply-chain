import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { deletePoDocument } from "@/lib/db/po-documents";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id, documentId } = await params;
    const supabase = createAdminClient();
    const result = await deletePoDocument(supabase, documentId);

    if (result.purchase_order_id !== id) {
      return NextResponse.json(
        { error: "Document does not belong to this purchase order." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
