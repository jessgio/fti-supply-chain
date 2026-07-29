import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { getExtractCalculatorForSku } from "@/lib/db/extract-calculator";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const productSkuId = searchParams.get("product_sku_id")?.trim();
    if (!productSkuId) {
      return NextResponse.json(
        { error: "product_sku_id is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result = await getExtractCalculatorForSku(supabase, productSkuId);
    if (!result) {
      return NextResponse.json({ error: "SKU not found." }, { status: 404 });
    }

    return NextResponse.json({ calculator: result });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
