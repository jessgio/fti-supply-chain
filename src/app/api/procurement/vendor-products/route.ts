import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listVendorProductMappings,
  upsertVendorProductNames,
} from "@/lib/db/vendor-products";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const mappings = await listVendorProductMappings(supabase);
    return NextResponse.json({ mappings });
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
      .map((u: { sku_id: string; vendor_product_name?: string | null }) => ({
        sku_id: u.sku_id,
        vendor_product_name: u.vendor_product_name ?? null,
      }));

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    await upsertVendorProductNames(supabase, updates);
    const mappings = await listVendorProductMappings(supabase);
    return NextResponse.json({ mappings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
