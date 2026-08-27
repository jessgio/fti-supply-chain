import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { createSku, SkuAlreadyExistsError } from "@/lib/db/skus";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

type SkuScope = "mapped" | "unclassified" | "all";

function mapSkuRow(row: {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_extract: boolean;
  is_clearance: boolean;
  is_active: boolean;
  franchise_id: string | null;
  product_franchises: unknown;
}) {
  const franchise = row.product_franchises as
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
    is_packaging: row.is_packaging,
    is_extract: Boolean(row.is_extract),
    is_clearance: Boolean(row.is_clearance),
    is_active: row.is_active,
    franchise_id: row.franchise_id,
    franchise_name: franchiseName,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");
    const scope: SkuScope =
      scopeParam === "unclassified" || scopeParam === "all"
        ? scopeParam
        : "mapped";
    const countOnly = searchParams.get("count_only") === "1";

    const supabase = createAdminClient();

    if (countOnly && scope === "unclassified") {
      const { count, error } = await supabase
        .from("skus")
        .select("id", { count: "exact", head: true })
        .eq("is_bundle", false)
        .eq("is_packaging", false)
        .eq("is_extract", false)
        .is("franchise_id", null);
      if (error) throw error;
      return NextResponse.json({ count: count ?? 0 });
    }

    let query = supabase
      .from("skus")
      .select(
        "id, sku_code, name, is_bundle, is_packaging, is_extract, is_clearance, is_active, franchise_id, product_franchises(name)",
      )
      .order("sku_code");

    if (scope === "mapped") {
      query = query.or(
        "franchise_id.not.is.null,is_bundle.eq.true,is_packaging.eq.true,is_extract.eq.true",
      );
    } else if (scope === "unclassified") {
      query = query
        .eq("is_bundle", false)
        .eq("is_packaging", false)
        .eq("is_extract", false)
        .is("franchise_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const skus = (data ?? []).map(mapSkuRow);
    return NextResponse.json({ skus, count: skus.length });
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

    const isBundle = Boolean(body.is_bundle);
    const isPackaging = Boolean(body.is_packaging);
    const isExtract = Boolean(body.is_extract);
    const kindCount = [isBundle, isPackaging, isExtract].filter(Boolean).length;
    if (kindCount > 1) {
      return NextResponse.json(
        {
          error:
            "A SKU cannot be more than one of bundle, packaging, or extract.",
        },
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
      is_bundle: isBundle,
      is_packaging: isPackaging,
      is_extract: isExtract,
      retail_price:
        body.retail_price != null ? Number(body.retail_price) : null,
    });

    return NextResponse.json({ ok: true, sku });
  } catch (error) {
    if (error instanceof SkuAlreadyExistsError) {
      return NextResponse.json(
        { error: error.message, existing: error.existing },
        { status: 409 },
      );
    }
    const message = errorMessage(error);
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
