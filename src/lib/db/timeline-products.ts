import type { SupabaseClient } from "@supabase/supabase-js";
import { listFinishedGoodSkus } from "@/lib/db/product-packaging";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import type { TimelineProductOption } from "@/types/database";

export async function listTimelineProductOptions(
  supabase: SupabaseClient,
): Promise<TimelineProductOption[]> {
  const [products, { recommendations }] = await Promise.all([
    listFinishedGoodSkus(supabase),
    loadRestockRecommendations(supabase),
  ]);

  const forecastBySku = new Map(
    recommendations.map((row) => [row.sku_code, row]),
  );

  return products.map((product) => {
    const forecast = forecastBySku.get(product.sku_code);
    return {
      id: product.id,
      sku_code: product.sku_code,
      name: product.name,
      franchise_name: product.franchise_name,
      is_active: product.is_active,
      projected_stockout_date: forecast?.projected_stockout_date ?? null,
      days_until_stockout: forecast?.days_until_stockout ?? null,
      current_stock: forecast?.current_stock ?? 0,
    };
  });
}
