import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteDeliveryNote,
  getDeliveryNote,
  updateDeliveryNote,
} from "@/lib/db/delivery-notes";
import { requirePortalToken } from "@/lib/delivery-note/portal-auth";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const denied = await requirePortalToken(token);
    if (denied) return denied;

    const supabase = createAdminClient();
    const note = await getDeliveryNote(supabase, id);
    if (!note) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const denied = await requirePortalToken(token);
    if (denied) return denied;

    const body = await request.json();
    const supabase = createAdminClient();
    const note = await updateDeliveryNote(supabase, id, {
      po_id: body.po_id,
      delivery_date: body.delivery_date,
      recipient_name: body.recipient_name,
      lines: body.lines ?? [],
    });

    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const denied = await requirePortalToken(token);
    if (denied) return denied;

    const supabase = createAdminClient();
    await deleteDeliveryNote(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "Delivery note not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
