import { revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadRestockRecommendationsUncached,
  type ForecastParams,
} from "@/lib/forecast/service";

export const FORECAST_CACHE_TAG = "forecast";
const REVALIDATE_SECONDS = 120;

function paramsCacheKey(params: ForecastParams): string {
  return JSON.stringify({
    leadTimeDays: params.leadTimeDays ?? null,
    safetyStockMonths: params.safetyStockMonths ?? null,
    targetStockMonths: params.targetStockMonths ?? null,
    historyDays: params.historyDays ?? null,
    ewmaDays: params.ewmaDays ?? null,
  });
}

export function invalidateForecastCache(): void {
  revalidateTag(FORECAST_CACHE_TAG, { expire: 0 });
}

export function getCachedRestockRecommendations(params: ForecastParams = {}) {
  const key = paramsCacheKey(params);
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      return loadRestockRecommendationsUncached(supabase, params);
    },
    ["restock-recommendations", key],
    { revalidate: REVALIDATE_SECONDS, tags: [FORECAST_CACHE_TAG] },
  );
}
