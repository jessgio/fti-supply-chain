import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listExtractCodes,
  listOpenPosForExtractInbound,
  getExtractInboundDnSettings,
} from "@/lib/db/extract-inbound-delivery-notes";
import { requireReadRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const [pos, extractCodes, settings] = await Promise.all([
      listOpenPosForExtractInbound(supabase),
      listExtractCodes(supabase),
      getExtractInboundDnSettings(supabase),
    ]);

    return NextResponse.json({
      pos,
      extractCodes,
      defaultRecipient: settings.recipient_pic_name ?? "",
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
