import { NextResponse } from "next/server";
import {
  aggregateGrowthForView,
} from "@/lib/analytics/growth-load";
import { getCachedGrowthAnalytics } from "@/lib/analytics/growth-cache";
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
    const aggregateChannels =
      searchParams.get("aggregate_channels") !== "false";

    const { points, coverage } = await getCachedGrowthAnalytics({
      grain,
      channelId,
      franchiseId,
      from,
      to,
    })();

    const viewPoints = aggregateGrowthForView(
      points,
      grain,
      channelId ?? "",
      aggregateChannels,
    );

    return NextResponse.json({ grain, points: viewPoints, coverage });
  } catch (error) {
    console.error("Growth analytics failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
