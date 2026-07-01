import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePackagingItem } from "@/lib/db/delivery-notes";
import { requireWriteRole } from "@/lib/auth";
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
    const supabase = createAdminClient();
    const item = await updatePackagingItem(supabase, id, {
      item_code: body.item_code,
      product_name: body.product_name,
      is_active: body.is_active,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
