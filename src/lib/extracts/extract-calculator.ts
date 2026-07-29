import { round5 } from "@/lib/extracts/ledger";

export interface ExtractCalculatorFormulaRow {
  extract_id: string;
  extract_item_no: string;
  extract_name: string | null;
  extract_kg_per_unit: number;
  ending_balance: number;
}

export interface ExtractCalculatorRow extends ExtractCalculatorFormulaRow {
  /** Whole pcs this extract alone can support from current balance. */
  max_pcs: number;
}

export interface ExtractNeedRow extends ExtractCalculatorFormulaRow {
  needed_kg: number;
  shortfall_kg: number;
  covers: boolean;
}

export interface ExtractSkuQtyPlan {
  product_sku_id: string;
  qty: number;
  formulas: Array<{
    extract_id: string;
    extract_item_no: string;
    extract_name: string | null;
    extract_kg_per_unit: number;
  }>;
}

export interface AggregatedExtractNeedRow {
  extract_id: string;
  extract_item_no: string;
  extract_name: string | null;
  ending_balance: number;
  needed_kg: number;
  shortfall_kg: number;
  covers: boolean;
  /** SKU codes that contribute demand for this extract. */
  sku_codes: string[];
}

/** Whole finished units supported by one extract line. */
export function maxPcsFromBalance(
  endingBalance: number,
  kgPerUnit: number,
): number {
  if (!(kgPerUnit > 0) || !Number.isFinite(endingBalance)) return 0;
  return Math.max(0, Math.floor(endingBalance / kgPerUnit));
}

/** Limiting finished units across all formula extracts (min of each line). */
export function computeMaxMakeablePcs(
  rows: ExtractCalculatorFormulaRow[],
): { max_pcs: number; limiting_extract_id: string | null } {
  if (rows.length === 0) {
    return { max_pcs: 0, limiting_extract_id: null };
  }

  let maxPcs = Number.POSITIVE_INFINITY;
  let limiting: string | null = null;

  for (const row of rows) {
    const pcs = maxPcsFromBalance(
      row.ending_balance,
      row.extract_kg_per_unit,
    );
    if (pcs < maxPcs) {
      maxPcs = pcs;
      limiting = row.extract_id;
    }
  }

  if (!Number.isFinite(maxPcs)) {
    return { max_pcs: 0, limiting_extract_id: null };
  }
  return { max_pcs: maxPcs, limiting_extract_id: limiting };
}

export function withMaxPcsRows(
  rows: ExtractCalculatorFormulaRow[],
): ExtractCalculatorRow[] {
  return rows.map((row) => ({
    ...row,
    max_pcs: maxPcsFromBalance(row.ending_balance, row.extract_kg_per_unit),
  }));
}

/** Extract kg required for a proposed finished qty (single SKU). */
export function computeExtractNeedForQty(
  rows: ExtractCalculatorFormulaRow[],
  qty: number,
): ExtractNeedRow[] {
  if (!(qty > 0) || !Number.isFinite(qty)) {
    return rows.map((row) => ({
      ...row,
      needed_kg: 0,
      shortfall_kg: 0,
      covers: true,
    }));
  }

  return rows.map((row) => {
    const needed_kg = round5(qty * row.extract_kg_per_unit);
    const shortfall_kg = round5(Math.max(0, needed_kg - row.ending_balance));
    return {
      ...row,
      needed_kg,
      shortfall_kg,
      covers: shortfall_kg <= 0,
    };
  });
}

/**
 * Aggregate extract need across multiple SKUs with proposed qtys,
 * sharing one ending balance per extract.
 */
export function computeAggregatedExtractNeed(
  plans: Array<
    ExtractSkuQtyPlan & {
      product_sku_code: string;
      ending_balance_by_extract: Map<string, number>;
    }
  >,
): AggregatedExtractNeedRow[] {
  const neededByExtract = new Map<string, number>();
  const metaByExtract = new Map<
    string,
    {
      item_no: string;
      name: string | null;
      balance: number;
      skuCodes: Set<string>;
    }
  >();

  for (const plan of plans) {
    if (!(plan.qty > 0) || !Number.isFinite(plan.qty)) continue;
    for (const formula of plan.formulas) {
      if (!(formula.extract_kg_per_unit > 0)) continue;
      const needed = round5(plan.qty * formula.extract_kg_per_unit);
      neededByExtract.set(
        formula.extract_id,
        round5((neededByExtract.get(formula.extract_id) ?? 0) + needed),
      );
      const existing = metaByExtract.get(formula.extract_id);
      if (existing) {
        existing.skuCodes.add(plan.product_sku_code);
      } else {
        metaByExtract.set(formula.extract_id, {
          item_no: formula.extract_item_no,
          name: formula.extract_name,
          balance: plan.ending_balance_by_extract.get(formula.extract_id) ?? 0,
          skuCodes: new Set([plan.product_sku_code]),
        });
      }
    }
  }

  const rows: AggregatedExtractNeedRow[] = [];
  for (const [extractId, needed_kg] of neededByExtract) {
    const meta = metaByExtract.get(extractId);
    if (!meta) continue;
    const ending_balance = round5(meta.balance);
    const shortfall_kg = round5(Math.max(0, needed_kg - ending_balance));
    rows.push({
      extract_id: extractId,
      extract_item_no: meta.item_no,
      extract_name: meta.name,
      ending_balance,
      needed_kg,
      shortfall_kg,
      covers: shortfall_kg <= 0,
      sku_codes: [...meta.skuCodes].sort(),
    });
  }

  rows.sort((a, b) => a.extract_item_no.localeCompare(b.extract_item_no));
  return rows;
}
