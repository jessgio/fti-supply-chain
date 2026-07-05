import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkuProductName } from "@/types/database";
import { updateSku } from "@/lib/db/skus";

export type { SkuProductName };

type SkuRow = {
  id: string;
  sku_code: string;
  name: string | null;
};

function mapRow(row: SkuRow): SkuProductName {
  return {
    sku_id: row.id,
    sku_code: row.sku_code,
    product_name: row.name,
  };
}

export async function listSkuProductNames(
  supabase: SupabaseClient,
): Promise<SkuProductName[]> {
  const { data, error } = await supabase
    .from("skus")
    .select("id, sku_code, name")
    .eq("is_bundle", false)
    .order("sku_code");
  if (error) throw error;
  return ((data ?? []) as SkuRow[]).map(mapRow);
}

export async function upsertSkuProductNames(
  supabase: SupabaseClient,
  updates: { sku_id: string; product_name: string | null }[],
): Promise<void> {
  for (const update of updates) {
    await updateSku(supabase, update.sku_id, { name: update.product_name });
  }
}
