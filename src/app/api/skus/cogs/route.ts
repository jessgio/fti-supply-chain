import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSkuCogs, parseUnitCogsInput, upsertSkuCogs } from "@/lib/db/sku-cogs";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const skus = await listSkuCogs(supabase);
    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const raw = Array.isArray(body?.updates) ? body.updates : [];
    const updates: { sku_id: string; unit_cogs: number | null }[] = [];

    for (const row of raw) {
      if (!row?.sku_id) continue;
      try {
        let unit_cogs: number | null;
        if (
          row.unit_cogs === null ||
          row.unit_cogs === "" ||
          (typeof row.unit_cogs_raw === "string" && !row.unit_cogs_raw.trim())
        ) {
          unit_cogs = null;
        } else if (typeof row.unit_cogs === "number") {
          if (!Number.isFinite(row.unit_cogs) || row.unit_cogs < 0) {
            throw new Error("COGS must be a non-negative number.");
          }
          unit_cogs = row.unit_cogs;
        } else {
          unit_cogs = parseUnitCogsInput(String(row.unit_cogs_raw ?? ""));
        }
        updates.push({ sku_id: row.sku_id, unit_cogs });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid COGS value." },
          { status: 400 },
        );
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    await upsertSkuCogs(supabase, updates);
    const skus = await listSkuCogs(supabase);
    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
