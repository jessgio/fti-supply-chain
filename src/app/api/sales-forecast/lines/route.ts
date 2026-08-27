import { NextResponse } from "next/server";
import {
  getCurrentProfile,
  requireCommercialWrite,
} from "@/lib/auth";
import { notifySalesForecastOversell } from "@/lib/db/notifications";
import {
  isSopGroup,
  loadSopForecast,
  upsertSkuMonthPlans,
} from "@/lib/db/sales-forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 120;

export async function PATCH(request: Request) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;
    const profile = await getCurrentProfile();

    const body = await request.json();
    const year = Number(body.year);
    const group = String(body.group ?? "");
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

    const raw: unknown[] = Array.isArray(body.lines) ? body.lines : [];
    const lines = raw
      .map((row) => {
        const item = row as {
          sku_id?: string;
          month?: number;
          projected_qty?: number;
          avg_discount_pct?: number;
        };
        return {
          sku_id: String(item.sku_id ?? ""),
          month: Number(item.month),
          projected_qty: Number(item.projected_qty ?? 0),
          avg_discount_pct: Number(item.avg_discount_pct ?? 0),
        };
      })
      .filter((row) => row.sku_id && row.month >= 1 && row.month <= 12);

    const supabase = createAdminClient();
    const skuIds = await upsertSkuMonthPlans(supabase, {
      year,
      group,
      lines,
      userId: profile?.id ?? null,
      keepExistingUploadId: true,
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
