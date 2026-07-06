import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { searchPosForStatusUpdateLinking } from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    const excludePoId = searchParams.get("exclude") ?? undefined;

    const pos = await searchPosForStatusUpdateLinking(createAdminClient(), query, {
      excludePoId,
    });
    return NextResponse.json({ pos });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
