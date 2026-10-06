import { NextResponse } from "next/server";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import {
  applySkuAlias,
  clearSkuAlias,
  listSkuAliases,
} from "@/lib/db/sku-aliases";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { aliasAssignmentError } from "@/lib/skus/alias-resolve";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 180;

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const aliases = await listSkuAliases(supabase);
    return NextResponse.json({ aliases });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = (await request.json()) as {
      alias_sku_id?: string;
      canonical_sku_id?: string;
    };
    const aliasSkuId = body.alias_sku_id?.trim() ?? "";
    const canonicalSkuId = body.canonical_sku_id?.trim() ?? "";

    const supabase = createAdminClient();
    const existing = await listSkuAliases(supabase);
    const invalid = aliasAssignmentError(
      aliasSkuId,
      canonicalSkuId,
      existing.map((row) => ({
        alias_sku_id: row.alias_sku_id,
        canonical_sku_id: row.canonical_sku_id,
      })),
    );
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const result = await applySkuAlias(supabase, aliasSkuId, canonicalSkuId);
    invalidateForecastCache();
    const aliases = await listSkuAliases(supabase);
    return NextResponse.json({ ok: true, ...result, aliases });
  } catch (error) {
    const message = errorMessage(error);
    if (message.startsWith("Alias saved")) invalidateForecastCache();
    const status = /cannot alias|not found|already alias|itself an alias|required/i.test(
      message,
    )
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const aliasSkuId = new URL(request.url).searchParams.get("alias_sku_id")?.trim() ?? "";
    if (!aliasSkuId) {
      return NextResponse.json({ error: "alias_sku_id is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    await clearSkuAlias(supabase, aliasSkuId);
    invalidateForecastCache();
    const aliases = await listSkuAliases(supabase);
    return NextResponse.json({ ok: true, aliases });
  } catch (error) {
    const message = errorMessage(error);
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
