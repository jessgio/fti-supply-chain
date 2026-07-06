import { NextResponse } from "next/server";
import { getCurrentProfile, requireReadRole } from "@/lib/auth";
import {
  createStatusUpdate,
  extractMentionIds,
  listStatusUpdatePoGroups,
  listStatusUpdatesForSku,
  listStatusUpdateSkuSummaries,
  parseConnectedRefs,
} from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get("sku_id");
    const grouped = searchParams.get("grouped") === "1";

    const supabase = createAdminClient();
    if (grouped) {
      const groups = await listStatusUpdatePoGroups(supabase);
      return NextResponse.json({ groups });
    }
    if (skuId) {
      const updates = await listStatusUpdatesForSku(supabase, skuId);
      return NextResponse.json({ updates });
    }

    const summaries = await listStatusUpdateSkuSummaries(supabase);
    return NextResponse.json({ summaries });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.sku_id || typeof body.sku_id !== "string") {
      return NextResponse.json({ error: "SKU is required." }, { status: 400 });
    }
    if (!body.po_id || typeof body.po_id !== "string") {
      return NextResponse.json({ error: "PO is required." }, { status: 400 });
    }
    if (
      !body.applies_to_all_po_products &&
      Array.isArray(body.scoped_sku_ids) &&
      body.scoped_sku_ids.length === 0
    ) {
      return NextResponse.json(
        { error: "Select at least one product or apply to all PO products." },
        { status: 400 },
      );
    }
    if (!body.body?.trim()) {
      return NextResponse.json(
        { error: "Update body is required." },
        { status: 400 },
      );
    }

    const mentioned = Array.isArray(body.mentioned_user_ids)
      ? body.mentioned_user_ids
      : extractMentionIds(body.body);

    const update = await createStatusUpdate(createAdminClient(), {
      sku_id: body.sku_id,
      po_id: body.po_id,
      body: body.body.trim(),
      author_id: profile.id,
      mentioned_user_ids: mentioned,
      connected_refs: parseConnectedRefs(body.connected_refs),
      applies_to_all_po_products: Boolean(body.applies_to_all_po_products),
      scoped_sku_ids: Array.isArray(body.scoped_sku_ids)
        ? body.scoped_sku_ids.filter((id: unknown) => typeof id === "string")
        : undefined,
    });

    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
