import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkuCogsRow } from "@/types/database";
import { updateSku } from "@/lib/db/skus";

export type { SkuCogsRow };

type SkuRow = {
  id: string;
  sku_code: string;
  name: string | null;
  retail_price: number | null;
  unit_cogs: number | null;
  product_franchises: { name: string } | { name: string }[] | null;
};

function franchiseName(row: SkuRow): string | null {
  const franchise = row.product_franchises;
  if (Array.isArray(franchise)) return franchise[0]?.name ?? null;
  return franchise?.name ?? null;
}

function mapRow(row: SkuRow): SkuCogsRow {
  return {
    sku_id: row.id,
    sku_code: row.sku_code,
    product_name: row.name,
    franchise_name: franchiseName(row),
    retail_price:
      row.retail_price != null ? Number(row.retail_price) : null,
    unit_cogs: row.unit_cogs != null ? Number(row.unit_cogs) : null,
  };
}

const SELECT =
  "id, sku_code, name, retail_price, unit_cogs, product_franchises(name)";

export async function listSkuCogs(
  supabase: SupabaseClient,
): Promise<SkuCogsRow[]> {
  const { data, error } = await supabase
    .from("skus")
    .select(SELECT)
    .eq("is_bundle", false)
    .not("franchise_id", "is", null)
    .order("sku_code");
  if (error) throw error;
  return ((data ?? []) as unknown as SkuRow[]).map(mapRow);
}

export async function upsertSkuCogs(
  supabase: SupabaseClient,
  updates: { sku_id: string; unit_cogs: number | null }[],
): Promise<void> {
  for (const update of updates) {
    await updateSku(supabase, update.sku_id, { unit_cogs: update.unit_cogs });
  }
}

export function parseUnitCogsInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("COGS must be a non-negative number.");
  }
  return value;
}

export function grossMarginPct(
  retailPrice: number | null,
  unitCogs: number | null,
): number | null {
  if (retailPrice == null || retailPrice <= 0 || unitCogs == null) return null;
  return ((retailPrice - unitCogs) / retailPrice) * 100;
}
