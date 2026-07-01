import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDeliveryNote, listDeliveryNotes } from "@/lib/db/delivery-notes";
import { requirePortalToken } from "@/lib/delivery-note/portal-auth";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const denied = await requirePortalToken(token);
    if (denied) return denied;

    const supabase = createAdminClient();
    const notes = await listDeliveryNotes(supabase);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const denied = await requirePortalToken(token);
    if (denied) return denied;

    const body = await request.json();
    const supabase = createAdminClient();
    const note = await createDeliveryNote(supabase, {
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
