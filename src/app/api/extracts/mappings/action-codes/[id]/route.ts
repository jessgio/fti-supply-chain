import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  deleteActionCodeMapping,
  updateActionCodeMapping,
} from "@/lib/db/extract-mappings";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { EXTRACT_CATEGORIES } from "@/lib/extracts/categories";
import type { ExtractCategory } from "@/types/database";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const patch: { action_code?: string; category?: ExtractCategory } = {};
    if (body?.action_code !== undefined) {
      patch.action_code = String(body.action_code);
    }
    if (body?.category !== undefined) {
      if (!EXTRACT_CATEGORIES.includes(body.category as ExtractCategory)) {
        return NextResponse.json(
          { error: "Invalid category." },
          { status: 400 },
        );
      }
      patch.category = body.category as ExtractCategory;
    }

    const mapping = await updateActionCodeMapping(createAdminClient(), id, patch);
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    await deleteActionCodeMapping(createAdminClient(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
