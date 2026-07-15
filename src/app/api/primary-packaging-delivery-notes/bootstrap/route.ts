import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listOpenPosForPrimaryPackaging,
  listPrimaryPackagingItems,
  getPrimaryPackagingDnSettings,
} from "@/lib/db/primary-packaging-delivery-notes";
import { requireReadRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const [pos, packagingItems, settings] = await Promise.all([
      listOpenPosForPrimaryPackaging(supabase),
      listPrimaryPackagingItems(supabase),
      getPrimaryPackagingDnSettings(supabase),
    ]);

    return NextResponse.json({
      pos,
      packagingItems,
      defaultRecipient: settings.recipient_pic_name ?? "",
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
