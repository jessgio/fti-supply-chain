import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPrimaryPackagingDeliveryNote,
  listPrimaryPackagingDeliveryNotes,
} from "@/lib/db/primary-packaging-delivery-notes";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const notes = await listPrimaryPackagingDeliveryNotes(supabase);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const supabase = createAdminClient();
    const note = await createPrimaryPackagingDeliveryNote(supabase, {
      po_id: body.po_id,
      delivery_date: body.delivery_date,
      recipient_name: body.recipient_name,
      lines: body.lines ?? [],
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
