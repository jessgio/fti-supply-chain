import type { SopBomComponent, SopSkuRow } from "@/types/database";

export const UNMAPPED_FRANCHISE = "Unmapped";

/** Franchises a SKU row contributes to (BOM franchises for bundles). */
export function franchisesForRow(row: SopSkuRow): string[] {
  if (row.is_bundle) {
    const names = new Set<string>();
    for (const c of row.bom_components ?? []) {
      names.add(c.franchise_name?.trim() || UNMAPPED_FRANCHISE);
    }
    if (names.size === 0) names.add(UNMAPPED_FRANCHISE);
    return [...names];
  }
  return [row.franchise_name?.trim() || UNMAPPED_FRANCHISE];
}

export function rowMatchesFranchiseFilter(
  row: SopSkuRow,
  franchiseFilter: string[],
): boolean {
  if (franchiseFilter.length === 0) return true;
  return franchisesForRow(row).some((name) => franchiseFilter.includes(name));
}

type FranchiseWeights = {
  franchise: string;
  /** Component units per bundle sold. */
  qtyPerBundle: number;
  /** List-value weight for allocating net sales (qty × RSP, fallback qty). */
  valueWeight: number;
};

/**
 * Collapse BOM lines into per-franchise weights for allocating bundle metrics.
 * Qty uses component units; net uses RSP×qty share (falls back to qty share).
 */
export function bomFranchiseWeights(
  components: SopBomComponent[],
): FranchiseWeights[] {
  const byFranchise = new Map<
    string,
    { qtyPerBundle: number; valueWeight: number }
  >();
  for (const c of components) {
    const franchise = c.franchise_name?.trim() || UNMAPPED_FRANCHISE;
    const qty = Number.isFinite(c.qty_per_bundle) ? c.qty_per_bundle : 0;
    if (qty <= 0) continue;
    const rsp =
      c.retail_price != null && Number.isFinite(c.retail_price) && c.retail_price > 0
        ? c.retail_price
        : 0;
    const cur = byFranchise.get(franchise) ?? {
      qtyPerBundle: 0,
      valueWeight: 0,
    };
    cur.qtyPerBundle += qty;
    cur.valueWeight += qty * rsp;
    byFranchise.set(franchise, cur);
  }
  if (byFranchise.size === 0) {
    return [
      {
        franchise: UNMAPPED_FRANCHISE,
        qtyPerBundle: 1,
        valueWeight: 1,
      },
    ];
  }
  const rows = [...byFranchise.entries()].map(([franchise, w]) => ({
    franchise,
    qtyPerBundle: w.qtyPerBundle,
    valueWeight: w.valueWeight,
  }));
  const valueTotal = rows.reduce((s, r) => s + r.valueWeight, 0);
  if (valueTotal <= 0) {
    for (const r of rows) r.valueWeight = r.qtyPerBundle;
  }
  return rows;
}

export type FranchiseAllocation = {
  franchise: string;
  /** Allocated units (component units for bundles; SKU units for singles). */
  qty: number;
  post_tax: number;
  list_value: number;
  /** Share of bundle (1 for singles). */
  share: number;
};

/** Split a qty / post-tax / list-value triple across franchises for one SKU row. */
export function allocateSkuMetrics(
  row: SopSkuRow,
  qty: number,
  postTax: number,
  listValue: number,
): FranchiseAllocation[] {
  if (!row.is_bundle) {
    const franchise = row.franchise_name?.trim() || UNMAPPED_FRANCHISE;
    return [
      {
        franchise,
        qty,
        post_tax: postTax,
        list_value: listValue,
        share: 1,
      },
    ];
  }
  const weights = bomFranchiseWeights(row.bom_components ?? []);
  const valueTotal = weights.reduce((s, w) => s + w.valueWeight, 0) || 1;
  return weights.map((w) => {
    const share = w.valueWeight / valueTotal;
    return {
      franchise: w.franchise,
      qty: qty * w.qtyPerBundle,
      post_tax: postTax * share,
      list_value: listValue * share,
      share,
    };
  });
}

/** Allocate a scalar (stock, on-order, …) with the same shares as net sales. */
export function allocateSkuScalar(
  row: SopSkuRow,
  value: number,
): { franchise: string; value: number; qtyUnits: number }[] {
  if (!row.is_bundle) {
    return [
      {
        franchise: row.franchise_name?.trim() || UNMAPPED_FRANCHISE,
        value,
        qtyUnits: value,
      },
    ];
  }
  const weights = bomFranchiseWeights(row.bom_components ?? []);
  const valueTotal = weights.reduce((s, w) => s + w.valueWeight, 0) || 1;
  return weights.map((w) => ({
    franchise: w.franchise,
    value: value * (w.valueWeight / valueTotal),
    qtyUnits: value * w.qtyPerBundle,
  }));
}
