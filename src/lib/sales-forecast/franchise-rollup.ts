import type { SopBomComponent, SopSkuRow } from "@/types/database";

export const UNMAPPED_FRANCHISE = "Unmapped";

/**
 * Attach nested BOMs when a component is itself a bundle (e.g. a FREE GWP
 * SKU that wraps a real sellable SKU). `seen` prevents cycles.
 */
export function nestBundleBoms(
  components: SopBomComponent[],
  bomByBundle: Map<string, SopBomComponent[]>,
  seen: Set<string> = new Set(),
): SopBomComponent[] {
  return components.map((c) => {
    if (seen.has(c.sku_id)) {
      return { ...c, components: undefined };
    }
    const nested = bomByBundle.get(c.sku_id);
    if (!nested || nested.length === 0) {
      return { ...c, components: undefined };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(c.sku_id);
    return {
      ...c,
      components: nestBundleBoms(nested, bomByBundle, nextSeen),
    };
  });
}

/**
 * Leaf sellable SKUs after exploding nested bundles. Qty is multiplied through
 * each level (1 parent × 1 FREE wrapper × 1 component = 1 unit).
 */
export function bomLeafComponents(
  components: SopBomComponent[],
  qtyScale = 1,
): SopBomComponent[] {
  const leaves: SopBomComponent[] = [];
  for (const c of components) {
    const qty =
      (Number.isFinite(c.qty_per_bundle) ? c.qty_per_bundle : 0) * qtyScale;
    if (qty <= 0) continue;
    const nested = (c.components ?? []).filter(
      (n) => Number.isFinite(n.qty_per_bundle) && n.qty_per_bundle > 0,
    );
    if (nested.length > 0) {
      leaves.push(...bomLeafComponents(nested, qty));
      continue;
    }
    leaves.push({
      sku_id: c.sku_id,
      sku_code: c.sku_code,
      qty_per_bundle: qty,
      franchise_name: c.franchise_name,
      retail_price: c.retail_price,
    });
  }
  return leaves;
}

/** Franchises a SKU row contributes to (BOM leaf franchises for bundles). */
export function franchisesForRow(row: SopSkuRow): string[] {
  if (row.is_bundle) {
    const names = new Set<string>();
    for (const c of bomLeafComponents(row.bom_components ?? [])) {
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
  const leaves = bomLeafComponents(components);
  const byFranchise = new Map<
    string,
    { qtyPerBundle: number; valueWeight: number }
  >();
  for (const c of leaves) {
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

export type ComponentSkuAllocation = {
  sku_id: string;
  sku_code: string;
  name: string | null;
  franchise: string;
  qty: number;
  post_tax: number;
  list_value: number;
};

/** Split metrics onto single SKUs (identity for singles; BOM components for bundles). */
export function allocateToComponentSkus(
  row: SopSkuRow,
  qty: number,
  postTax: number,
  listValue: number,
): ComponentSkuAllocation[] {
  if (!row.is_bundle) {
    return [
      {
        sku_id: row.sku_id,
        sku_code: row.sku_code,
        name: row.name,
        franchise: row.franchise_name?.trim() || UNMAPPED_FRANCHISE,
        qty,
        post_tax: postTax,
        list_value: listValue,
      },
    ];
  }

  const components = bomLeafComponents(row.bom_components ?? []);
  if (components.length === 0) {
    return [
      {
        sku_id: row.sku_id,
        sku_code: row.sku_code,
        name: row.name,
        franchise: UNMAPPED_FRANCHISE,
        qty,
        post_tax: postTax,
        list_value: listValue,
      },
    ];
  }

  const weights = components.map((c) => {
    const rsp =
      c.retail_price != null &&
      Number.isFinite(c.retail_price) &&
      c.retail_price > 0
        ? c.retail_price
        : 0;
    return {
      component: c,
      qtyPerBundle: c.qty_per_bundle,
      valueWeight: c.qty_per_bundle * rsp,
    };
  });
  let valueTotal = weights.reduce((s, w) => s + w.valueWeight, 0);
  if (valueTotal <= 0) {
    for (const w of weights) w.valueWeight = w.qtyPerBundle;
    valueTotal = weights.reduce((s, w) => s + w.valueWeight, 0) || 1;
  }

  return weights.map((w) => {
    const share = w.valueWeight / valueTotal;
    return {
      sku_id: w.component.sku_id,
      sku_code: w.component.sku_code,
      name: null,
      franchise: w.component.franchise_name?.trim() || UNMAPPED_FRANCHISE,
      qty: qty * w.qtyPerBundle,
      post_tax: postTax * share,
      list_value: listValue * share,
    };
  });
}

/** Split a qty / post-tax / list-value triple across franchises for one SKU row. */
export function allocateSkuMetrics(
  row: SopSkuRow,
  qty: number,
  postTax: number,
  listValue: number,
): FranchiseAllocation[] {
  const byFranchise = new Map<string, FranchiseAllocation>();
  for (const part of allocateToComponentSkus(row, qty, postTax, listValue)) {
    const cur = byFranchise.get(part.franchise);
    if (cur) {
      cur.qty += part.qty;
      cur.post_tax += part.post_tax;
      cur.list_value += part.list_value;
    } else {
      byFranchise.set(part.franchise, {
        franchise: part.franchise,
        qty: part.qty,
        post_tax: part.post_tax,
        list_value: part.list_value,
        share: 0,
      });
    }
  }
  const rows = [...byFranchise.values()];
  const valueTotal = rows.reduce((s, r) => s + r.post_tax, 0);
  for (const r of rows) {
    r.share = valueTotal > 0 ? r.post_tax / valueTotal : 0;
  }
  return rows;
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
