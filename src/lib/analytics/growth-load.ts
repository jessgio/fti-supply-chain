import {
  buildGrowthPoints,
  getLatestPeriod,
  periodToDateBounds,
  sumGrowthAcrossChannels,
  type DailyRow,
} from "@/lib/analytics/growth";
import { fetchAllRpc } from "@/lib/supabase/fetch-all";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FranchiseGrowthPoint,
  PeriodCoverage,
  TimeGrain,
} from "@/types/database";

export function mapGrowthRpcRows(
  rpcData: Record<string, unknown>[],
): DailyRow[] {
  return rpcData.map((row) => ({
    sale_date: String(row.sale_date),
    channel_id: String(row.channel_id),
    channel_name: String(row.channel_name),
    franchise_id: String(row.franchise_id),
    franchise_name: String(row.franchise_name),
    total_qty: Number(row.total_qty),
    total_net_sales: Number(row.total_net_sales),
  }));
}

export interface GrowthLoadParams {
  grain?: TimeGrain;
  channelId?: string | null;
  franchiseId?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface GrowthLoadResult {
  grain: TimeGrain;
  points: FranchiseGrowthPoint[];
  coverage: PeriodCoverage | null;
}

export async function loadGrowthAnalytics(
  supabase: SupabaseClient,
  params: GrowthLoadParams = {},
): Promise<GrowthLoadResult> {
  const grain = (params.grain ?? "month") as TimeGrain;
  const rpcParams = {
    p_grain: grain,
    p_from: params.from || null,
    p_to: params.to || null,
    p_channel_id: params.channelId || null,
    p_franchise_id: params.franchiseId || null,
  };

  const rpcData = await fetchAllRpc<Record<string, unknown>>(
    supabase,
    "get_franchise_period_totals",
    rpcParams,
  );
  const periodRows = mapGrowthRpcRows(rpcData);

  let dailyRowsForLatest: DailyRow[] | null = null;
  if (grain === "month" || grain === "week") {
    const preliminary = buildGrowthPoints(periodRows, grain, null);
    const latestPeriod = getLatestPeriod(preliminary.points);
    if (latestPeriod) {
      const bounds = periodToDateBounds(latestPeriod, grain);
      const dailyRpc = await fetchAllRpc<Record<string, unknown>>(
        supabase,
        "get_franchise_period_totals",
        {
          ...rpcParams,
          p_grain: "day",
          p_from: bounds.from,
          p_to: bounds.to,
        },
      );
      dailyRowsForLatest = mapGrowthRpcRows(dailyRpc);
    }
  }

  const { points, coverage } = buildGrowthPoints(
    periodRows,
    grain,
    dailyRowsForLatest,
  );

  return { grain, points, coverage };
}

/** Channel-aggregated points for all-channels views. */
export function aggregateGrowthForView(
  points: FranchiseGrowthPoint[],
  grain: TimeGrain,
  channelId: string,
): FranchiseGrowthPoint[] {
  return channelId ? points : sumGrowthAcrossChannels(points, grain);
}
