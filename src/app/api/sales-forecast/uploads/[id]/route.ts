import { NextResponse } from "next/server";
import { requireCommercialWrite } from "@/lib/auth";
import { deleteForecastUpload } from "@/lib/db/sales-forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Upload id is required." }, { status: 400 });
    }
    const supabase = createAdminClient();
    await deleteForecastUpload(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
