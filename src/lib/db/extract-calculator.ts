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

export interface ExtractCalculatorResult {
  product_sku_id: string;
  product_sku_code: string;
  product_name: string | null;
  extracts: ExtractCalculatorRow[];
  max_pcs: number;
  limiting_extract_id: string | null;
}

export async function getExtractCalculatorForSku(
  supabase: SupabaseClient,
  productSkuId: string,
): Promise<ExtractCalculatorResult | null> {
  const { data: sku, error: skuError } = await supabase
    .from("skus")
    .select("id, sku_code, name, is_packaging")
    .eq("id", productSkuId)
    .maybeSingle();
  if (skuError) throw skuError;
  if (!sku) return null;

  const skuRow = sku as SkuRow;
  if (skuRow.is_packaging) {
    return {
      product_sku_id: skuRow.id,
      product_sku_code: skuRow.sku_code,
      product_name: skuRow.name,
      extracts: [],
      max_pcs: 0,
      limiting_extract_id: null,
    };
  }

  const formulasBySku = await getFormulasBySkuIds(supabase, [productSkuId]);
  const formulas = formulasBySku.get(productSkuId) ?? [];
  if (formulas.length === 0) {
    return {
      product_sku_id: skuRow.id,
      product_sku_code: skuRow.sku_code,
      product_name: skuRow.name,
      extracts: [],
      max_pcs: 0,
      limiting_extract_id: null,
    };
  }

  const extractIds = formulas.map((f) => f.extract_id);
  const { data: statsData, error: statsError } = await supabase.rpc(
    "get_extract_summaries",
  );
  if (statsError) throw statsError;

  const balanceByExtract = new Map<string, number>();
  for (const row of (statsData ?? []) as ExtractStatsRow[]) {
    balanceByExtract.set(row.extract_id, Number(row.ending_balance ?? 0));
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
