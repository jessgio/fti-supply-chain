import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { commitExtract } from "@/lib/db/extracts";
import type { ParsedExtract } from "@/types/database";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = (await request.json()) as { parsed?: ParsedExtract };
    const parsed = body.parsed;
    if (!parsed || !parsed.item_no?.trim()) {
      return NextResponse.json(
        { error: "Missing extract Item No." },
        { status: 400 },
      );
    }
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "No rows to save." },
        { status: 400 },
      );
    }

    const result = await commitExtract(createAdminClient(), parsed);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Extract commit failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
