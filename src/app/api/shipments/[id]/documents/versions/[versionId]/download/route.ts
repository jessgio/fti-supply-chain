import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { getShipmentDocumentDownloadUrl } from "@/lib/db/shipment-documents";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { versionId } = await params;
    const supabase = createAdminClient();
    const download = await getShipmentDocumentDownloadUrl(supabase, versionId);
    return NextResponse.json(download);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
