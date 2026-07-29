import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeMaxMakeablePcs,
  withMaxPcsRows,
  type ExtractCalculatorFormulaRow,
  type ExtractCalculatorRow,
} from "@/lib/extracts/extract-calculator";
import { getFormulasBySkuIds } from "@/lib/db/product-extract-formulas";

type ExtractStatsRow = {
  extract_id: string;
  ending_balance: number;
};

type SkuRow = {
  id: string;
  sku_code: string;
  name: string | null;
  is_packaging: boolean;
};

export interface ExtractCalculatorProductResult {
  product_sku_id: string;
  product_sku_code: string;
  product_name: string | null;
  extracts: ExtractCalculatorRow[];
  max_pcs: number;
  limiting_extract_id: string | null;
}

/** @deprecated Prefer ExtractCalculatorMultiResult — kept for single-SKU shape. */
export type ExtractCalculatorResult = ExtractCalculatorProductResult;

export interface ExtractCalculatorMultiResult {
  products: ExtractCalculatorProductResult[];
}

function buildProductResult(
  skuRow: SkuRow,
  formulas: Array<{
    extract_id: string;
    extract_item_no: string;
    extract_name: string | null;
    extract_kg_per_unit: number;
  }>,
  balanceByExtract: Map<string, number>,
): ExtractCalculatorProductResult {
  if (skuRow.is_packaging || formulas.length === 0) {
    return {
      product_sku_id: skuRow.id,
      product_sku_code: skuRow.sku_code,
      product_name: skuRow.name,
      extracts: [],
      max_pcs: 0,
      limiting_extract_id: null,
    };
  }

  const baseRows: ExtractCalculatorFormulaRow[] = formulas.map((f) => ({
    extract_id: f.extract_id,
    extract_item_no: f.extract_item_no,
    extract_name: f.extract_name,
    extract_kg_per_unit: f.extract_kg_per_unit,
    ending_balance: balanceByExtract.get(f.extract_id) ?? 0,
  }));

  const extracts = withMaxPcsRows(baseRows);
  const { max_pcs, limiting_extract_id } = computeMaxMakeablePcs(baseRows);

  return {
    product_sku_id: skuRow.id,
    product_sku_code: skuRow.sku_code,
    product_name: skuRow.name,
    extracts,
    max_pcs,
    limiting_extract_id,
  };
}

export async function getExtractCalculatorForSku(
  supabase: SupabaseClient,
  productSkuId: string,
): Promise<ExtractCalculatorProductResult | null> {
  const multi = await getExtractCalculatorForSkus(supabase, [productSkuId]);
  if (multi.products.length === 0) return null;
  return multi.products[0] ?? null;
}

export async function getExtractCalculatorForSkus(
  supabase: SupabaseClient,
  productSkuIds: string[],
): Promise<ExtractCalculatorMultiResult> {
  const uniqueIds = [...new Set(productSkuIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { products: [] };
  }

  const { data: skus, error: skuError } = await supabase
    .from("skus")
    .select("id, sku_code, name, is_packaging")
    .in("id", uniqueIds);
  if (skuError) throw skuError;

  const skuById = new Map(
    ((skus ?? []) as SkuRow[]).map((row) => [row.id, row] as const),
  );

  // Preserve request order; skip unknown ids.
  const orderedSkus = uniqueIds
    .map((id) => skuById.get(id))
    .filter((row): row is SkuRow => Boolean(row));

  if (orderedSkus.length === 0) {
    return { products: [] };
  }

  const formulasBySku = await getFormulasBySkuIds(
    supabase,
    orderedSkus.map((s) => s.id),
  );

  const { data: statsData, error: statsError } = await supabase.rpc(
    "get_extract_summaries",
  );
  if (statsError) throw statsError;

  const balanceByExtract = new Map<string, number>();
  for (const row of (statsData ?? []) as ExtractStatsRow[]) {
    balanceByExtract.set(row.extract_id, Number(row.ending_balance ?? 0));
  }

  const products = orderedSkus.map((skuRow) => {
    const formulas = (formulasBySku.get(skuRow.id) ?? []).map((f) => ({
      extract_id: f.extract_id,
      extract_item_no: f.extract_item_no,
      extract_name: f.extract_name,
      extract_kg_per_unit: f.extract_kg_per_unit,
    }));
    return buildProductResult(skuRow, formulas, balanceByExtract);
  });

  return { products };
}
