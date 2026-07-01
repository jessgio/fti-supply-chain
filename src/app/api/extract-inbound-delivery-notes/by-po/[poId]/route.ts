import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listExtractInboundDeliveryNotesByPo } from "@/lib/db/extract-inbound-delivery-notes";
import { requireReadRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poId: string }> },
) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { poId } = await params;
    const supabase = createAdminClient();
    const notes = await listExtractInboundDeliveryNotesByPo(supabase, poId);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
