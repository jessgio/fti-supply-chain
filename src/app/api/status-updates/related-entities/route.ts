import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { listRelatedEntitiesForSku } from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get("sku_id");
    if (!skuId) {
      return NextResponse.json({ error: "sku_id is required." }, { status: 400 });
    }

    const entities = await listRelatedEntitiesForSku(createAdminClient(), skuId);
    return NextResponse.json({ entities });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
