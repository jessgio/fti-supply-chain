import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listSkusForPackagingToggle } from "@/lib/db/packaging";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const supabase = createAdminClient();
    const skus = await listSkusForPackagingToggle(supabase);
    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
