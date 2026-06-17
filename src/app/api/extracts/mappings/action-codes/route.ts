import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createActionCodeMapping,
  loadActionCodeMappings,
} from "@/lib/db/extract-mappings";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { EXTRACT_CATEGORIES } from "@/lib/extracts/categories";
import type { ExtractCategory } from "@/types/database";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const mappings = await loadActionCodeMappings(createAdminClient());
    return NextResponse.json({ mappings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const action_code = String(body?.action_code ?? "").trim();
    const category = body?.category as ExtractCategory;
    if (!action_code) {
      return NextResponse.json(
        { error: "Action code is required." },
        { status: 400 },
      );
    }
    if (!EXTRACT_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category." },
        { status: 400 },
      );
    }

    const mapping = await createActionCodeMapping(createAdminClient(), {
      action_code,
      category,
    });
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
