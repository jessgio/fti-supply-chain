import { NextResponse } from "next/server";
import {
  getCurrentProfile,
  requireCommercialWrite,
} from "@/lib/auth";
import { notifySalesForecastOversell } from "@/lib/db/notifications";
import {
  createForecastUpload,
  isSopGroup,
  listEligibleSkus,
  loadSopForecast,
  upsertSkuMonthPlans,
} from "@/lib/db/sales-forecast";
import { parseForecastCsv } from "@/lib/sales-forecast/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;
    const profile = await getCurrentProfile();

    const form = await request.formData();
    const year = Number(form.get("year"));
    const group = String(form.get("group") ?? "");
    const file = form.get("file");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year." }, { status: 400 });
    }
    if (!isSopGroup(group)) {
      return NextResponse.json(
        { error: "group must be online or offline." },
        { status: 400 },
      );
    }
    if (year < new Date().getFullYear()) {
      return NextResponse.json(
        { error: "Past years are read-only." },
        { status: 400 },
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
    }

    const text = await file.text();
    const parsed = parseForecastCsv(text, year);
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        {
          error: parsed.errors.slice(0, 20).join(" "),
          errors: parsed.errors.slice(0, 50),
        },
        { status: 400 },
      );
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "CSV has a header but no data rows." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const skus = await listEligibleSkus(supabase);
    const byCode = new Map(skus.map((sku) => [sku.sku_code.toUpperCase(), sku]));
    const unknown: string[] = [];
    const lines: Array<{
      sku_id: string;
      month: number;
      projected_qty: number;
      avg_discount_pct: number;
    }> = [];
    const lastByKey = new Map<string, (typeof lines)[number]>();
    for (const row of parsed.rows) {
      const sku = byCode.get(row.skuCode.toUpperCase());
      if (!sku) {
        unknown.push(`Line ${row.line}: unknown SKU ${row.skuCode}.`);
        continue;
      }
      lastByKey.set(`${sku.id}:${row.month}`, {
        sku_id: sku.id,
        month: row.month,
        projected_qty: row.qty,
        avg_discount_pct: row.discountPct,
      });
    }
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: unknown.slice(0, 20).join(" "), errors: unknown.slice(0, 50) },
        { status: 400 },
      );
    }
    lines.push(...lastByKey.values());

    const uploadId = await createForecastUpload(supabase, {
      group,
      year,
      filename: file.name || "forecast.csv",
      rowCount: lines.length,
      userId: profile?.id ?? null,
    });
    const skuIds = await upsertSkuMonthPlans(supabase, {
      year,
      group,
      lines,
      userId: profile?.id ?? null,
      uploadId,
    });
    const payload = await loadSopForecast(supabase, year, group);
    await notifySalesForecastOversell(supabase, {
      actorId: profile?.id ?? null,
      group,
      year,
      rows: payload.rows.filter((row) => skuIds.includes(row.sku_id)),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
