import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  deleteProductPackagingLink,
  updateProductPackagingLink,
} from "@/lib/db/product-packaging";
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
    const qty = Number(body?.qty_per_unit);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "Quantity per unit must be greater than zero." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const link = await updateProductPackagingLink(supabase, id, qty);
    return NextResponse.json({ link });
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
    const supabase = createAdminClient();
    await deleteProductPackagingLink(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
