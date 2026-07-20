import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { deleteInboundReceive } from "@/lib/db/inbound";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    await deleteInboundReceive(createAdminClient(), id);
    invalidateForecastCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
