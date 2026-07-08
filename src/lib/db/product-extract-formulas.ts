import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProductExtractFormula,
  ProductExtractFormulaInput,
} from "@/types/database";

type FormulaRow = {
  id: string;
  product_sku_id: string;
  extract_id: string;
  extract_kg_per_unit: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product: { sku_code: string; name: string | null } | null;
  extract: { item_no: string; description: string | null } | null;
};

const FORMULA_SELECT =
  "id, product_sku_id, extract_id, extract_kg_per_unit, notes, created_at, updated_at, " +
  "product:product_sku_id(sku_code, name), " +
  "extract:extract_id(item_no, description)";

function mapFormulaRow(row: FormulaRow): ProductExtractFormula {
  return {
    id: row.id,
    product_sku_id: row.product_sku_id,
    product_sku_code: row.product?.sku_code ?? "",
    product_name: row.product?.name ?? null,
    extract_id: row.extract_id,
    extract_item_no: row.extract?.item_no ?? "",
    extract_name: row.extract?.description ?? null,
    extract_kg_per_unit: Number(row.extract_kg_per_unit),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listProductExtractFormulas(
  supabase: SupabaseClient,
  filters?: { productSkuId?: string; extractId?: string },
): Promise<ProductExtractFormula[]> {
  let query = supabase.from("product_extract_formulas").select(FORMULA_SELECT);
  if (filters?.productSkuId) {
    query = query.eq("product_sku_id", filters.productSkuId);
  }
  if (filters?.extractId) {
    query = query.eq("extract_id", filters.extractId);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as FormulaRow[]).map(mapFormulaRow);
}

export async function getFormulasBySkuIds(
  supabase: SupabaseClient,
  skuIds: string[],
): Promise<Map<string, ProductExtractFormula[]>> {
  if (skuIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("product_extract_formulas")
    .select(FORMULA_SELECT)
    .in("product_sku_id", skuIds);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as FormulaRow[]).map(mapFormulaRow);
  const bySku = new Map<string, ProductExtractFormula[]>();
  for (const row of rows) {
    const list = bySku.get(row.product_sku_id) ?? [];
    list.push(row);
    bySku.set(row.product_sku_id, list);
  }
  return bySku;
}

export async function createProductExtractFormula(
  supabase: SupabaseClient,
  input: ProductExtractFormulaInput,
): Promise<ProductExtractFormula> {
  if (input.extract_kg_per_unit <= 0) {
    throw new Error("Extract kg per unit must be greater than zero.");
  }
  const { data, error } = await supabase
    .from("product_extract_formulas")
    .insert({
      product_sku_id: input.product_sku_id,
      extract_id: input.extract_id,
      extract_kg_per_unit: input.extract_kg_per_unit,
      notes: input.notes?.trim() || null,
    })
    .select(FORMULA_SELECT)
    .single();
  if (error) throw error;
  return mapFormulaRow(data as unknown as FormulaRow);
}

export async function updateProductExtractFormula(
  supabase: SupabaseClient,
  id: string,
  input: Partial<ProductExtractFormulaInput>,
): Promise<ProductExtractFormula> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.extract_kg_per_unit !== undefined) {
    if (input.extract_kg_per_unit <= 0) {
      throw new Error("Extract kg per unit must be greater than zero.");
    }
    patch.extract_kg_per_unit = input.extract_kg_per_unit;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim() || null;
  }
  const { data, error } = await supabase
    .from("product_extract_formulas")
    .update(patch)
    .eq("id", id)
    .select(FORMULA_SELECT)
    .single();
  if (error) throw error;
  return mapFormulaRow(data as unknown as FormulaRow);
}

export async function deleteProductExtractFormula(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("product_extract_formulas")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
