import { NextResponse } from "next/server";
import { requireCommercialWrite, requireWriteRole } from "@/lib/auth";
import { updateSku } from "@/lib/db/skus";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

type SkuPatchBody = {
  name?: string | null;
  is_active?: boolean;
  is_bundle?: boolean;
  is_packaging?: boolean;
  is_extract?: boolean;
  is_clearance?: boolean;
  franchise_id?: string | null;
  franchise_name?: string | null;
  retail_price?: number | string | null;
  effective_from?: string | null;
};

function parseRetailPrice(value: number | string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("RSP must be a number greater than 0.");
  }
  return n === 0 ? null : n;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as SkuPatchBody;

    const input: {
      name?: string | null;
      is_active?: boolean;
      is_bundle?: boolean;
      is_packaging?: boolean;
      is_extract?: boolean;
      is_clearance?: boolean;
      franchise_id?: string | null;
      franchise_name?: string | null;
      retail_price?: number | null;
      effective_from?: string | null;
    } = {};

    if (body.name !== undefined) {
      input.name = typeof body.name === "string" ? body.name : null;
    }

    if (typeof body.is_active === "boolean") {
      input.is_active = body.is_active;
    }
    if (typeof body.is_bundle === "boolean") {
      input.is_bundle = body.is_bundle;
    }
    if (typeof body.is_packaging === "boolean") {
      input.is_packaging = body.is_packaging;
    }
    if (typeof body.is_extract === "boolean") {
      input.is_extract = body.is_extract;
    }
    if (typeof body.is_clearance === "boolean") {
      input.is_clearance = body.is_clearance;
    }
    if (body.franchise_id !== undefined) {
      input.franchise_id =
        typeof body.franchise_id === "string" ? body.franchise_id : null;
    }
    if (body.franchise_name !== undefined) {
      input.franchise_name =
        typeof body.franchise_name === "string" ? body.franchise_name : null;
    }
    if (body.retail_price !== undefined) {
      input.retail_price = parseRetailPrice(body.retail_price);
    }
    if (typeof body.effective_from === "string") {
      input.effective_from = body.effective_from;
    }

    const keys = Object.keys(input);
    if (keys.length === 0 || (keys.length === 1 && keys[0] === "effective_from")) {
      return NextResponse.json(
        {
          error:
            "Provide name, is_active, is_bundle, is_packaging, is_extract, is_clearance, franchise_id, franchise_name, and/or retail_price",
        },
        { status: 400 },
      );
    }

    const rspOnly = keys.every(
      (key) => key === "retail_price" || key === "effective_from",
    );
    const denied = rspOnly
      ? await requireCommercialWrite()
      : await requireWriteRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const sku = await updateSku(supabase, id, input);

    if (
      typeof input.is_active === "boolean" ||
      typeof input.is_clearance === "boolean" ||
      typeof input.is_bundle === "boolean" ||
      typeof input.is_packaging === "boolean" ||
      typeof input.is_extract === "boolean"
    ) {
      invalidateForecastCache();
    }

    return NextResponse.json({ ok: true, sku });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("not found")
      ? 404
      : message.includes("RSP must") || message.includes("effective_from")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
