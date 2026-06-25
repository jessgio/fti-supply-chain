import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPoTimelineEntry } from "@/lib/db/inbound";
import { errorMessage } from "@/lib/errors";
import { requireReadRole } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { id } = await params;
    const entry = await getPoTimelineEntry(createAdminClient(), id);
    if (!entry) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
