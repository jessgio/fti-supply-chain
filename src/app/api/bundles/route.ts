import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { listBundleSkus } from "@/lib/db/bundle-components";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const supabase = createAdminClient();
    const bundles = await listBundleSkus(supabase);
    return NextResponse.json({ bundles });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
