import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  deleteItemNameMapping,
  updateItemNameMapping,
} from "@/lib/db/extract-mappings";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const patch: {
      manufacturer_name?: string;
      item_no?: string;
      description?: string | null;
    } = {};
    if (body?.manufacturer_name !== undefined) {
      patch.manufacturer_name = String(body.manufacturer_name);
    }
    if (body?.item_no !== undefined) {
      patch.item_no = String(body.item_no);
    }
    if (body?.description !== undefined) {
      patch.description =
        body.description === null ? null : String(body.description);
    }

    const mapping = await updateItemNameMapping(createAdminClient(), id, patch);
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
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
    await deleteItemNameMapping(createAdminClient(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
