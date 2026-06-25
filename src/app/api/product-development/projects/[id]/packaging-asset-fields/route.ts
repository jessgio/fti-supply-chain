import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { upsertPdPackagingAssetField } from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id: projectId } = await context.params;
    const body = await request.json();
    const fieldKey = body.field_key?.toString();
    if (!fieldKey) {
      return NextResponse.json(
        { error: "field_key is required." },
        { status: 400 },
      );
    }

    const raw = body.value;
    const value =
      raw == null || String(raw).trim() === "" ? null : String(raw).trim();

    await upsertPdPackagingAssetField(
      createAdminClient(),
      projectId,
      fieldKey,
      value,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
