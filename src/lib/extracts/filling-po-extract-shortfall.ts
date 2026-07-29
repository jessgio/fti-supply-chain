import { round5 } from "@/lib/extracts/ledger";

export interface FillingOpenFgLine {
  po_id: string;
  sku_id: string;
  open_qty: number;
}

export interface FillingFormulaRef {
  extract_id: string;
  extract_item_no: string;
  extract_name: string | null;
  extract_kg_per_unit: number;
}

export interface ExtractBalanceRef {
  extract_id: string;
  ending_balance: number;
  item_no?: string;
  description?: string | null;
}

export interface FillingPoExtractShortfall {
  extract_id: string;
  extract_item_no: string;
  extract_name: string | null;
  po_needed_kg: number;
  total_needed_kg: number;
  ending_balance: number;
  shortfall_kg: number;
}

/**
 * Compare open Filling (finished-good) PO demand against extract balances.
 * Returns shortfalls only for extracts this PO needs where overall demand
 * exceeds stock.
 */
export function computeFillingPoExtractShortfalls(
  lines: FillingOpenFgLine[],
  formulasBySku: Map<string, FillingFormulaRef[]>,
  balances: ExtractBalanceRef[],
  poId: string,
): FillingPoExtractShortfall[] {
  const balanceByExtract = new Map(
    balances.map((b) => [b.extract_id, b] as const),
  );

  const totalNeeded = new Map<string, number>();
  const poNeeded = new Map<string, number>();
  const metaByExtract = new Map<
    string,
    { item_no: string; name: string | null }
  >();

  for (const line of lines) {
    if (line.open_qty <= 0) continue;
    const formulas = formulasBySku.get(line.sku_id);
    if (!formulas || formulas.length === 0) continue;

    for (const formula of formulas) {
      if (formula.extract_kg_per_unit <= 0) continue;
      const needed = round5(line.open_qty * formula.extract_kg_per_unit);
      totalNeeded.set(
        formula.extract_id,
        round5((totalNeeded.get(formula.extract_id) ?? 0) + needed),
      );
      if (line.po_id === poId) {
        poNeeded.set(
          formula.extract_id,
          round5((poNeeded.get(formula.extract_id) ?? 0) + needed),
        );
      }
      if (!metaByExtract.has(formula.extract_id)) {
        metaByExtract.set(formula.extract_id, {
          item_no: formula.extract_item_no,
          name: formula.extract_name,
        });
      }
    }
  }

  const shortfalls: FillingPoExtractShortfall[] = [];
  for (const [extractId, total_needed_kg] of totalNeeded) {
    const po_needed_kg = poNeeded.get(extractId) ?? 0;
    if (po_needed_kg <= 0) continue;

    const balance = balanceByExtract.get(extractId);
    const ending_balance = round5(balance?.ending_balance ?? 0);
    const shortfall_kg = round5(Math.max(0, total_needed_kg - ending_balance));
    if (shortfall_kg <= 0) continue;

    const meta = metaByExtract.get(extractId);
    shortfalls.push({
      extract_id: extractId,
      extract_item_no:
        meta?.item_no || balance?.item_no || extractId.slice(0, 8),
      extract_name: meta?.name ?? balance?.description ?? null,
      po_needed_kg,
      total_needed_kg,
      ending_balance,
      shortfall_kg,
    });
  }

  shortfalls.sort((a, b) =>
    a.extract_item_no.localeCompare(b.extract_item_no),
  );
  return shortfalls;
}
