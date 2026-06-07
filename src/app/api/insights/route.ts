import { NextResponse } from "next/server";
import {
  buildAiInsight,
  buildRuleBasedInsight,
  DAYS_PER_MONTH,
  DEFAULT_LEAD_TIME_MONTHS,
  DEFAULT_SAFETY_STOCK_MONTHS,
  DEFAULT_TARGET_STOCK_MONTHS,
} from "@/lib/forecast/demand";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const leadTimeDays = Number(
      searchParams.get("lead_time_days") ??
        DEFAULT_LEAD_TIME_MONTHS * DAYS_PER_MONTH,
    );
    const safetyStockMonths = Number(
      searchParams.get("safety_stock_months") ?? DEFAULT_SAFETY_STOCK_MONTHS,
    );
    const targetStockMonths = Number(
      searchParams.get("target_stock_months") ?? DEFAULT_TARGET_STOCK_MONTHS,
    );
    const useAi = searchParams.get("ai") === "true";
    const historyDays = Number(searchParams.get("history_days") ?? 90);
    const ewmaDays = Number(searchParams.get("ewma_days") ?? 30);

    const supabase = createAdminClient();

    const { recommendations, skuCount } = await loadRestockRecommendations(
      supabase,
      {
        leadTimeDays,
        safetyStockMonths,
        targetStockMonths,
        historyDays,
        ewmaDays,
      },
    );

    const insight = useAi
      ? await buildAiInsight(recommendations)
      : buildRuleBasedInsight(recommendations);

    return NextResponse.json({
      insight,
      recommendations,
      sku_count: skuCount,
      ai_enabled: useAi,
    });
  } catch (error) {
    console.error("Insights failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
