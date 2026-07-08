import { round5 } from "@/lib/extracts/ledger";

export interface FormulaInput {
  extract_id: string;
  extract_kg_per_unit: number;
}

export interface ReportLineInput {
  sku_id: string;
  qty_produced: number;
  formulas: FormulaInput[];
}

export interface AllocationInput {
  extract_id: string;
  allocated_kg: number;
}

export interface ReconciliationExtractRow {
  extract_id: string;
  actual_kg: number;
  expected_kg: number;
  variance_kg: number;
  variance_pct: number | null;
  total_pcs: number;
  actual_kg_per_unit: number | null;
  expected_kg_per_unit: number | null;
}

export interface ReconciliationSkuRow {
  sku_id: string;
  qty_produced: number;
  extract_id: string;
  extract_kg_per_unit: number;
  expected_kg: number;
}

export function computeProductionReconciliation(
  lines: ReportLineInput[],
  allocations: AllocationInput[],
): {
  by_extract: ReconciliationExtractRow[];
  by_sku: ReconciliationSkuRow[];
} {
  const bySku: ReconciliationSkuRow[] = [];
  const expectedByExtract = new Map<string, number>();
  const pcsByExtract = new Map<string, number>();

  for (const line of lines) {
    for (const formula of line.formulas) {
      const expected = round5(line.qty_produced * formula.extract_kg_per_unit);
      bySku.push({
        sku_id: line.sku_id,
        qty_produced: line.qty_produced,
        extract_id: formula.extract_id,
        extract_kg_per_unit: formula.extract_kg_per_unit,
        expected_kg: expected,
      });
      expectedByExtract.set(
        formula.extract_id,
        round5((expectedByExtract.get(formula.extract_id) ?? 0) + expected),
      );
      pcsByExtract.set(
        formula.extract_id,
        round5((pcsByExtract.get(formula.extract_id) ?? 0) + line.qty_produced),
      );
    }
  }

  const actualByExtract = new Map<string, number>();
  for (const alloc of allocations) {
    actualByExtract.set(
      alloc.extract_id,
      round5((actualByExtract.get(alloc.extract_id) ?? 0) + alloc.allocated_kg),
    );
  }

  const extractIds = new Set([
    ...expectedByExtract.keys(),
    ...actualByExtract.keys(),
  ]);

  const byExtract: ReconciliationExtractRow[] = [...extractIds].map(
    (extractId) => {
      const actual = actualByExtract.get(extractId) ?? 0;
      const expected = expectedByExtract.get(extractId) ?? 0;
      const variance = round5(actual - expected);
      const totalPcs = pcsByExtract.get(extractId) ?? 0;
      return {
        extract_id: extractId,
        actual_kg: actual,
        expected_kg: expected,
        variance_kg: variance,
        variance_pct:
          expected > 0 ? Number(((variance / expected) * 100).toFixed(2)) : null,
        total_pcs: totalPcs,
        actual_kg_per_unit:
          totalPcs > 0 ? round5(actual / totalPcs) : null,
        expected_kg_per_unit:
          totalPcs > 0 ? round5(expected / totalPcs) : null,
      };
    },
  );

  return { by_extract: byExtract, by_sku: bySku };
}
