import { NextResponse } from "next/server";
import {
  aggregateGrowthForView,
  loadGrowthAnalytics,
} from "@/lib/analytics/growth-load";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { TimeGrain } from "@/types/database";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const grain = (searchParams.get("grain") ?? "month") as TimeGrain;
    const channelId = searchParams.get("channel_id");
    const franchiseId = searchParams.get("franchise_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const supabase = createAdminClient();
    const { points, coverage } = await loadGrowthAnalytics(supabase, {
      grain,
      channelId,
      franchiseId,
      from,
      to,
    });

    const viewPoints = aggregateGrowthForView(points, grain, channelId ?? "");

    return NextResponse.json({ grain, points: viewPoints, coverage });
  } catch (error) {
    console.error("Growth analytics failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
