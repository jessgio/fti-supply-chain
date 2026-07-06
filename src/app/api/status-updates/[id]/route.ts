import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  deleteStatusUpdate,
  extractMentionIds,
  getStatusUpdateById,
  parseConnectedRefs,
  updateStatusUpdate,
} from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewlyAddedMentionsOnEdit } from "@/lib/db/notifications";
import { errorMessage } from "@/lib/errors";
import type { UserRole } from "@/types/database";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EDIT_ROLES: UserRole[] = ["admin", "supply_chain"];

async function canModifyStatusUpdate(
  updateAuthorId: string,
  profile: { id: string; role: UserRole } | null,
): Promise<boolean> {
  if (!profile) return false;
  if (profile.id === updateAuthorId) return true;
  return EDIT_ROLES.includes(profile.role);
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminClient();
    const existing = await getStatusUpdateById(supabase, id);
    if (!existing) {
      return NextResponse.json({ error: "Status update not found." }, { status: 404 });
    }

    if (!(await canModifyStatusUpdate(existing.author_id, profile))) {
      return NextResponse.json(
        { error: "You do not have permission to delete this update." },
        { status: 403 },
      );
    }

    await deleteStatusUpdate(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminClient();
    const existing = await getStatusUpdateById(supabase, id);
    if (!existing) {
      return NextResponse.json({ error: "Status update not found." }, { status: 404 });
    }

    if (!(await canModifyStatusUpdate(existing.author_id, profile))) {
      return NextResponse.json(
        { error: "You do not have permission to edit this update." },
        { status: 403 },
      );
    }

    const body = await request.json();
    if (body.body !== undefined && !String(body.body).trim()) {
      return NextResponse.json(
        { error: "Update body cannot be empty." },
        { status: 400 },
      );
    }

    if (
      body.applies_to_all_po_products === false &&
      Array.isArray(body.scoped_sku_ids) &&
      body.scoped_sku_ids.length === 0
    ) {
      return NextResponse.json(
        { error: "Select at least one product or apply to all PO products." },
        { status: 400 },
      );
    }

    const mentioned =
      body.body !== undefined
        ? Array.isArray(body.mentioned_user_ids)
          ? body.mentioned_user_ids
          : extractMentionIds(String(body.body))
        : undefined;

    const update = await updateStatusUpdate(supabase, id, {
      body: body.body !== undefined ? String(body.body).trim() : undefined,
      mentioned_user_ids: mentioned,
      connected_refs:
        body.connected_refs !== undefined
          ? parseConnectedRefs(body.connected_refs)
          : undefined,
      applies_to_all_po_products:
        body.applies_to_all_po_products !== undefined
          ? Boolean(body.applies_to_all_po_products)
          : undefined,
      scoped_sku_ids: Array.isArray(body.scoped_sku_ids)
        ? body.scoped_sku_ids.filter((skuId: unknown) => typeof skuId === "string")
        : undefined,
    });

    if (body.body !== undefined && mentioned) {
      await notifyNewlyAddedMentionsOnEdit(supabase, {
        updateId: id,
        body: String(body.body).trim(),
        previousMentionedUserIds: existing.mentioned_user_ids ?? [],
        nextMentionedUserIds: mentioned,
        actorId: profile.id,
      });
    }

    return NextResponse.json({ update });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
