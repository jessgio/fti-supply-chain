import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { getPoDocumentDownloadUrl } from "@/lib/db/po-documents";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id, documentId } = await params;
    const supabase = createAdminClient();
    const download = await getPoDocumentDownloadUrl(supabase, documentId);

    if (download.purchase_order_id !== id) {
      return NextResponse.json(
        { error: "Document does not belong to this purchase order." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      url: download.url,
      file_name: download.file_name,
      mime_type: download.mime_type,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
