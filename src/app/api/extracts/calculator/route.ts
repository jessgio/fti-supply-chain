import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import {
  getExtractCalculatorForSku,
  getExtractCalculatorForSkus,
} from "@/lib/db/extract-calculator";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

function parseSkuIds(searchParams: URLSearchParams): string[] {
  const multi = searchParams.getAll("product_sku_id").flatMap((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const legacy = searchParams.get("product_sku_ids");
  if (legacy) {
    multi.push(
      ...legacy
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }
  return [...new Set(multi)];
}

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const productSkuIds = parseSkuIds(searchParams);
    if (productSkuIds.length === 0) {
      return NextResponse.json(
        { error: "product_sku_id is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Single-SKU response shape kept for compatibility.
    if (productSkuIds.length === 1) {
      const result = await getExtractCalculatorForSku(
        supabase,
        productSkuIds[0],
      );
      if (!result) {
        return NextResponse.json({ error: "SKU not found." }, { status: 404 });
      }
      return NextResponse.json({
        calculator: result,
        products: [result],
      });
    }

    const multi = await getExtractCalculatorForSkus(supabase, productSkuIds);
    if (multi.products.length === 0) {
      return NextResponse.json(
        { error: "No matching SKUs found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      products: multi.products,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
