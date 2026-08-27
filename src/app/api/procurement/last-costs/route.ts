import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSkuLastPurchaseCosts } from "@/lib/db/sku-purchase-costs";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const currency = searchParams.get("currency");
    const skuIdsParam = searchParams.get("sku_ids") ?? searchParams.get("sku_id");
    const skuIds = (skuIdsParam ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (skuIds.length === 0) {
      return NextResponse.json(
        { error: "Provide sku_ids (comma-separated) or sku_id." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const costs = await getSkuLastPurchaseCosts(supabase, skuIds, currency);
    return NextResponse.json({ costs });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
