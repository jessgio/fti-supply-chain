import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listExtractCodes } from "@/lib/db/extract-inbound-delivery-notes";
import { requireReadRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("all") !== "true";

    const supabase = createAdminClient();
    const items = await listExtractCodes(supabase, activeOnly);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
