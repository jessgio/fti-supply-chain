import { NextResponse } from "next/server";
import {
  getCurrentProfile,
  requireCommercialWrite,
} from "@/lib/auth";
import { notifySalesForecastOversell } from "@/lib/db/notifications";
import {
  createForecastUpload,
  isSopGroup,
  loadSopForecast,
  upsertSkuMonthPlans,
} from "@/lib/db/sales-forecast";
import { replaceForecastPendingSkus } from "@/lib/db/sales-forecast-pending";
import { parseForecastCsv } from "@/lib/sales-forecast/csv";
import {
  resolveForecastCsvSkus,
  type ForecastCatalogSku,
} from "@/lib/sales-forecast/resolve-csv-skus";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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
          error: parsed.errors.join("\n"),
          errors: parsed.errors,
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
    const catalog = await fetchAllRows<ForecastCatalogSku>(() =>
      supabase
        .from("skus")
        .select(
          "id, sku_code, name, is_bundle, is_packaging, is_extract, is_active, franchise_id, retail_price",
        ),
    );
    const { lines, pending, eligibleCodes } = resolveForecastCsvSkus(
      parsed.rows,
      catalog,
    );
    if (lines.length === 0 && pending.length === 0) {
      return NextResponse.json(
        { error: "CSV has a header but no data rows." },
        { status: 400 },
      );
    }

    const uploadId = await createForecastUpload(supabase, {
      group,
      year,
      filename: file.name || "forecast.csv",
      rowCount: lines.length,
      userId: profile?.id ?? null,
    });
    const skuIds =
      lines.length > 0
        ? await upsertSkuMonthPlans(supabase, {
            year,
            group,
            lines,
            userId: profile?.id ?? null,
            uploadId,
          })
        : [];
    await replaceForecastPendingSkus(supabase, {
      year,
      group,
      uploadId,
      userId: profile?.id ?? null,
      pending,
      eligibleCodes,
    });
    const payload = await loadSopForecast(supabase, year, group);
    if (skuIds.length > 0) {
      await notifySalesForecastOversell(supabase, {
        actorId: profile?.id ?? null,
        group,
        year,
        rows: payload.rows.filter((row) => skuIds.includes(row.sku_id)),
      });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
