import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getDeliveryNoteSettings,
  updateDeliveryNoteSettings,
} from "@/lib/db/delivery-notes";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = await createClient();
    const settings = await getDeliveryNoteSettings(supabase);
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
    if (body?.recipient_company !== undefined && !String(body.recipient_company).trim()) {
      return NextResponse.json(
        { error: "Recipient company is required." },
        { status: 400 },
      );
    }
    if (body?.recipient_address !== undefined && !String(body.recipient_address).trim()) {
      return NextResponse.json(
        { error: "Recipient address is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const settings = await updateDeliveryNoteSettings(supabase, {
      recipient_company: body?.recipient_company,
      recipient_address: body?.recipient_address,
      recipient_pic_name: body?.recipient_pic_name,
      recipient_phone: body?.recipient_phone,
      recipient_email: body?.recipient_email,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
