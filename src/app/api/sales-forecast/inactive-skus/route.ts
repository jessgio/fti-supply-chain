import { NextResponse } from "next/server";
import {
  getCurrentProfile,
  requireCommercialWrite,
  requireReadRole,
} from "@/lib/auth";
import {
  isSopGroup,
  loadSopYearForecast,
  replaceChannelInactiveSkus,
} from "@/lib/db/sales-forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const forecast = await loadSopYearForecast(supabase, year);
    return NextResponse.json({
      eligible_skus: forecast.eligible_skus,
      inactive_sku_ids: forecast.inactive_sku_ids,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;
    const profile = await getCurrentProfile();

    const body = await request.json();
    const group = body?.group;
    if (!isSopGroup(group)) {
      return NextResponse.json(
        { error: "group must be online or offline." },
        { status: 400 },
      );
    }
    const skuIds = Array.isArray(body?.sku_ids)
      ? body.sku_ids.map((id: unknown) => String(id ?? "")).filter(Boolean)
      : null;
    if (!skuIds) {
      return NextResponse.json(
        { error: "sku_ids must be an array of SKU ids." },
        { status: 400 },
      );
    }

    const year = Number(body?.year ?? new Date().getFullYear());
    const supabase = createAdminClient();
    const inactive = await replaceChannelInactiveSkus(supabase, {
      group,
      skuIds,
      userId: profile?.id ?? null,
    });

    if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
      const forecast = await loadSopYearForecast(supabase, year);
      return NextResponse.json({
        inactive_sku_ids: inactive,
        forecast,
      });
    }

    return NextResponse.json({ inactive_sku_ids: inactive });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
