import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deletePrimaryPackagingDeliveryNote,
  getPrimaryPackagingDeliveryNote,
  updatePrimaryPackagingDeliveryNote,
} from "@/lib/db/primary-packaging-delivery-notes";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    const note = await getPrimaryPackagingDeliveryNote(supabase, id);
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();
    const note = await updatePrimaryPackagingDeliveryNote(supabase, id, {
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    await deletePrimaryPackagingDeliveryNote(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "Delivery note not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
