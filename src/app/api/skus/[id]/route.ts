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
    const body = (await request.json()) as { is_active?: boolean };
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json(
        { error: "is_active must be a boolean" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("skus")
      .update({ is_active: body.is_active })
      .eq("id", id)
      .select("id, sku_code, is_active")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, sku: data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
