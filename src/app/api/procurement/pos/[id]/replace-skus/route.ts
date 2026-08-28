import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replacePurchaseOrderLineSkus } from "@/lib/db/procurement";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { errorMessage } from "@/lib/errors";
import { getCurrentProfile, requireWriteRole } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const raw = Array.isArray(body?.replacements) ? body.replacements : [];
    const replacements = raw
      .map((item: { po_line_id?: unknown; new_sku_id?: unknown }) => ({
        po_line_id: String(item?.po_line_id ?? ""),
        new_sku_id: String(item?.new_sku_id ?? ""),
      }))
      .filter((item: { po_line_id: string; new_sku_id: string }) =>
        Boolean(item.po_line_id && item.new_sku_id),
      );

    if (replacements.length === 0) {
      return NextResponse.json(
        { error: "Select an official SKU for at least one line." },
        { status: 400 },
      );
    }

    const profile = await getCurrentProfile();
    const supabase = createAdminClient();
    const result = await replacePurchaseOrderLineSkus(
      supabase,
      id,
      replacements,
      profile?.id ?? null,
    );
    invalidateForecastCache();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
