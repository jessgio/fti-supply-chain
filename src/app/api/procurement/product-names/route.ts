import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listSkuProductNames,
  upsertSkuProductNames,
} from "@/lib/db/sku-product-names";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const skus = await listSkuProductNames(supabase);
    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const raw = Array.isArray(body?.updates) ? body.updates : [];
    const updates = raw
      .filter((u: { sku_id?: string }) => u?.sku_id)
      .map((u: { sku_id: string; product_name?: string | null }) => ({
        sku_id: u.sku_id,
        product_name: u.product_name ?? null,
      }));

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    await upsertSkuProductNames(supabase, updates);
    const skus = await listSkuProductNames(supabase);
    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
