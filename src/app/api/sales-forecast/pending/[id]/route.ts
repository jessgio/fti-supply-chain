import { NextResponse } from "next/server";
import { getCurrentProfile, requireCommercialWrite } from "@/lib/auth";
import { loadSopForecast } from "@/lib/db/sales-forecast";
import {
  deleteForecastPendingSku,
  promoteForecastPendingSku,
  useSuggestedForecastSku,
} from "@/lib/db/sales-forecast-pending";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;
    const profile = await getCurrentProfile();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Pending id is required." }, { status: 400 });
    }

    const body = (await request.json()) as {
      action?: string;
      is_bundle?: boolean;
      franchise_id?: string | null;
      franchise_name?: string | null;
      retail_price?: number | string | null;
    };
    const supabase = createAdminClient();
    const result =
      body.action === "use_suggestion"
        ? await useSuggestedForecastSku(supabase, {
            pendingId: id,
            userId: profile?.id ?? null,
          })
        : await promoteForecastPendingSku(supabase, {
            pendingId: id,
            userId: profile?.id ?? null,
            isBundle: Boolean(body.is_bundle),
            franchiseId:
              typeof body.franchise_id === "string" && body.franchise_id
                ? body.franchise_id
                : null,
            franchiseName:
              typeof body.franchise_name === "string"
                ? body.franchise_name
                : null,
            retailPrice: Number(body.retail_price),
          });

    const payload = await loadSopForecast(supabase, result.year, result.group);
    return NextResponse.json(payload);
  } catch (error) {
    const message = errorMessage(error);
    const status =
      message.includes("not found")
        ? 404
        : message.includes("RSP") ||
            message.includes("Franchise") ||
            message.includes("suggested") ||
            message.includes("not an active")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Pending id is required." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const pending = await deleteForecastPendingSku(supabase, id);
    if (!pending) {
      return NextResponse.json({ error: "Pending SKU not found." }, { status: 404 });
    }
    const payload = await loadSopForecast(supabase, pending.year, pending.sop_group);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
