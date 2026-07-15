import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPrimaryPackagingDnSettings,
  updatePrimaryPackagingDnSettings,
} from "@/lib/db/primary-packaging-delivery-notes";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const settings = await getPrimaryPackagingDnSettings(supabase);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const supabase = createAdminClient();
    const settings = await updatePrimaryPackagingDnSettings(supabase, {
      recipient_company: body.recipient_company,
      recipient_address: body.recipient_address,
      recipient_pic_name: body.recipient_pic_name,
      recipient_phone: body.recipient_phone,
      recipient_email: body.recipient_email,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
