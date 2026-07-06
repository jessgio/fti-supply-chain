import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { listSkusWithActivePos } from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const skus = await listSkusWithActivePos(createAdminClient());
    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
