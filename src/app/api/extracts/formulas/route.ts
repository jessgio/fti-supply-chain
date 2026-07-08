import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createProductExtractFormula,
  listProductExtractFormulas,
} from "@/lib/db/product-extract-formulas";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const productSkuId = searchParams.get("product_sku_id") ?? undefined;
    const extractId = searchParams.get("extract_id") ?? undefined;

    const supabase = createAdminClient();
    const formulas = await listProductExtractFormulas(supabase, {
      productSkuId,
      extractId,
    });
    return NextResponse.json({ formulas });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    if (!body?.product_sku_id || !body?.extract_id) {
      return NextResponse.json(
        { error: "Product SKU and extract are required." },
        { status: 400 },
      );
    }
    const kgPerUnit = Number(body.extract_kg_per_unit);
    if (!Number.isFinite(kgPerUnit) || kgPerUnit <= 0) {
      return NextResponse.json(
        { error: "Extract kg per unit must be greater than zero." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const formula = await createProductExtractFormula(supabase, {
      product_sku_id: body.product_sku_id,
      extract_id: body.extract_id,
      extract_kg_per_unit: kgPerUnit,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ formula });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
