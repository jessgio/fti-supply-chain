import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
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
    const body = (await request.json()) as {
      is_active?: boolean;
      is_packaging?: boolean;
    };

    const updates: { is_active?: boolean; is_packaging?: boolean } = {};
    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }
    if (typeof body.is_packaging === "boolean") {
      updates.is_packaging = body.is_packaging;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Provide is_active and/or is_packaging as booleans" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("skus")
      .update(updates)
      .eq("id", id)
      .select("id, sku_code, is_active, is_packaging")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, sku: data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
