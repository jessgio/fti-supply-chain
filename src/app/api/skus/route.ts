import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { createSku } from "@/lib/db/skus";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("skus")
      .select(
        "id, sku_code, name, is_bundle, is_active, franchise_id, product_franchises(name)",
      )
      .or("franchise_id.not.is.null,is_bundle.eq.true")
      .order("sku_code");
    if (error) throw error;

    const skus = (data ?? []).map((row) => {
      const franchise = row.product_franchises as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const franchiseName = Array.isArray(franchise)
        ? (franchise[0]?.name ?? null)
        : (franchise?.name ?? null);
      return {
        id: row.id,
        sku_code: row.sku_code,
        name: row.name,
        is_bundle: row.is_bundle,
        is_active: row.is_active,
        franchise_id: row.franchise_id,
        franchise_name: franchiseName,
      };
    });

    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    if (!body?.sku_code || typeof body.sku_code !== "string") {
      return NextResponse.json(
        { error: "SKU code is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const sku = await createSku(supabase, {
      sku_code: body.sku_code,
      name: typeof body.name === "string" ? body.name : null,
      franchise_id:
        typeof body.franchise_id === "string" ? body.franchise_id : null,
      franchise_name:
        typeof body.franchise_name === "string" ? body.franchise_name : null,
      is_bundle: Boolean(body.is_bundle),
      retail_price:
        body.retail_price != null ? Number(body.retail_price) : null,
    });

    return NextResponse.json({ ok: true, sku });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
