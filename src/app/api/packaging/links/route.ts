import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createProductPackagingLink,
  listProductPackagingLinks,
} from "@/lib/db/product-packaging";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const supabase = createAdminClient();
    const links = await listProductPackagingLinks(supabase);
    return NextResponse.json({ links });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    if (!body?.product_sku_id || !body?.packaging_sku_id) {
      return NextResponse.json(
        { error: "Product and packaging SKU are required." },
        { status: 400 },
      );
    }
    const qty = Number(body.qty_per_unit);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "Quantity per unit must be greater than zero." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const link = await createProductPackagingLink(supabase, {
      product_sku_id: body.product_sku_id,
      packaging_sku_id: body.packaging_sku_id,
      qty_per_unit: qty,
    });
    return NextResponse.json({ link });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
