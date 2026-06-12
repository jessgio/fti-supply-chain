import type { SupabaseClient } from "@supabase/supabase-js";
import type { VendorProductMapping } from "@/types/database";

export type { VendorProductMapping };

type SkuRow = {
  id: string;
  sku_code: string;
  name: string | null;
  sku_vendor_product_names: { vendor_product_name: string } | null;
};

function mapRow(row: SkuRow): VendorProductMapping {
  return {
    sku_id: row.id,
    sku_code: row.sku_code,
    sku_name: row.name,
    vendor_product_name: row.sku_vendor_product_names?.vendor_product_name ?? null,
  };
}

const SELECT =
  "id, sku_code, name, sku_vendor_product_names(vendor_product_name)";

export async function listVendorProductMappings(
  supabase: SupabaseClient,
): Promise<VendorProductMapping[]> {
  const { data, error } = await supabase
    .from("skus")
    .select(SELECT)
    .eq("is_bundle", false)
    .order("sku_code");
  if (error) throw error;
  return ((data ?? []) as unknown as SkuRow[]).map(mapRow);
}

export async function getVendorProductNamesBySkuIds(
  supabase: SupabaseClient,
  skuIds: string[],
): Promise<Map<string, string>> {
  if (skuIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("sku_vendor_product_names")
    .select("sku_id, vendor_product_name")
    .in("sku_id", skuIds);
  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.sku_id, row.vendor_product_name);
  }
  return map;
}

export async function upsertVendorProductName(
  supabase: SupabaseClient,
  skuId: string,
  vendorProductName: string | null,
): Promise<void> {
  const trimmed = vendorProductName?.trim() ?? "";
  if (!trimmed) {
    const { error } = await supabase
      .from("sku_vendor_product_names")
      .delete()
      .eq("sku_id", skuId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("sku_vendor_product_names").upsert(
    {
      sku_id: skuId,
      vendor_product_name: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "sku_id" },
  );
  if (error) throw error;
}

export async function upsertVendorProductNames(
  supabase: SupabaseClient,
  updates: { sku_id: string; vendor_product_name: string | null }[],
): Promise<void> {
  for (const update of updates) {
    await upsertVendorProductName(
      supabase,
      update.sku_id,
      update.vendor_product_name,
    );
  }
}
