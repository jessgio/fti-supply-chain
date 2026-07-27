import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createBundleBomLink,
  listBundleBomLinks,
} from "@/lib/db/bundle-components";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const supabase = createAdminClient();
    const links = await listBundleBomLinks(supabase);
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
    if (!body?.bundle_sku_id || !body?.component_sku_id) {
      return NextResponse.json(
        { error: "Bundle and component SKU are required." },
        { status: 400 },
      );
    }
    const qty = Number(body.qty_per_bundle);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "Quantity per bundle must be greater than zero." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const link = await createBundleBomLink(supabase, {
      bundle_sku_id: body.bundle_sku_id,
      component_sku_id: body.component_sku_id,
      qty_per_bundle: qty,
    });
    return NextResponse.json({ link });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
