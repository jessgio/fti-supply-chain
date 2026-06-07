import { NextResponse } from "next/server";
import { aggregateFranchiseGrowth } from "@/lib/analytics/growth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRpc } from "@/lib/supabase/fetch-all";
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

    const rpcParams = {
      p_grain: grain,
      p_from: from || null,
      p_to: to || null,
      p_channel_id: channelId || null,
      p_franchise_id: franchiseId || null,
    };

    const rpcData = await fetchAllRpc<Record<string, unknown>>(
      supabase,
      "get_franchise_period_totals",
      rpcParams,
    );

    const rows = rpcData.map((row) => ({
      sale_date: String(row.sale_date),
      channel_id: String(row.channel_id),
      channel_name: String(row.channel_name),
      franchise_id: String(row.franchise_id),
      franchise_name: String(row.franchise_name),
      total_qty: Number(row.total_qty),
      total_net_sales: Number(row.total_net_sales),
    }));

    const points = aggregateFranchiseGrowth(rows, grain);

    return NextResponse.json({ grain, points });
  } catch (error) {
    console.error("Growth analytics failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
