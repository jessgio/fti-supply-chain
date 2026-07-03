import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadGrowthAnalytics,
  type GrowthLoadParams,
  type GrowthLoadResult,
} from "@/lib/analytics/growth-load";

const REVALIDATE_SECONDS = 120;

function paramsCacheKey(params: GrowthLoadParams): string {
  return JSON.stringify({
    grain: params.grain ?? "month",
    channelId: params.channelId ?? null,
    franchiseId: params.franchiseId ?? null,
    from: params.from ?? null,
    to: params.to ?? null,
  });
}

export function getCachedGrowthAnalytics(params: GrowthLoadParams = {}) {
  const key = paramsCacheKey(params);
  return unstable_cache(
    async (): Promise<GrowthLoadResult> => {
      const supabase = createAdminClient();
      return loadGrowthAnalytics(supabase, params);
    },
    ["growth-analytics", key],
    { revalidate: REVALIDATE_SECONDS },
  );
}
