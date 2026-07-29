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

/** Extract kg required for a proposed finished qty. */
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
