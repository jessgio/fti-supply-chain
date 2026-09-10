import type { SopBomComponent, SopSkuRow } from "@/types/database";
import { MONTHS } from "@/lib/sales-forecast/constants";
import { impliedDiscountPct } from "@/lib/sales-forecast/math";

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

function bundleBuildableQty(
  leaves: SopBomComponent[],
  qtyBySku: Map<string, number>,
): number {
  let min = Infinity;
  for (const leaf of leaves) {
    const qtyPer = leaf.qty_per_bundle;
    if (!Number.isFinite(qtyPer) || qtyPer <= 0) continue;
    min = Math.min(min, Math.floor((qtyBySku.get(leaf.sku_id) ?? 0) / qtyPer));
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

/**
 * Extra complete sets inbound unlocks: buildable after (on hand + on order)
 * minus buildable from on hand now. ETA is the latest batch among leaves
 * that still need their PO to reach that after-qty (oil already on the
 * shelf does not delay cream that is still in transit).
 */
export function extraCompleteSetsFromInbound(
  components: SopBomComponent[],
  onHandBySku: Map<string, number>,
  inboundBySku: Map<string, { qty: number; date: string | null }>,
): { qty: number; date: string | null } {
  const leaves = bomLeafComponents(components);
  if (leaves.length === 0) return { qty: 0, date: null };

  const afterBySku = new Map<string, number>();
  for (const leaf of leaves) {
    afterBySku.set(
      leaf.sku_id,
      (onHandBySku.get(leaf.sku_id) ?? 0) +
        (inboundBySku.get(leaf.sku_id)?.qty ?? 0),
    );
  }
  const now = bundleBuildableQty(leaves, onHandBySku);
  const after = bundleBuildableQty(leaves, afterBySku);
  const extra = after - now;
  if (extra <= 0) return { qty: 0, date: null };
  const neededDates: Array<string | null> = [];
  for (const leaf of leaves) {
    const qtyPer = leaf.qty_per_bundle;
    if (!Number.isFinite(qtyPer) || qtyPer <= 0) continue;
    if ((onHandBySku.get(leaf.sku_id) ?? 0) >= after * qtyPer) continue;
    neededDates.push(inboundBySku.get(leaf.sku_id)?.date ?? null);
  }
  const dated = neededDates.filter((date): date is string => Boolean(date));
  return {
    qty: extra,
    date:
      dated.length === 0 || dated.length !== neededDates.length
        ? null
        : dated.reduce((a, b) => (a > b ? a : b)),
  };
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

function positivePrice(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

export type BundleLeafShare = {
  component: SopBomComponent;
  qtyPerBundle: number;
  /** VAT-incl leaf list after equal residual: qty × (component RSP + residual/unit). */
  leafList: number;
  share: number;
};

/**
 * Set RSP is the list. Residual (set RSP − Σ component list) is spread
 * equally across component units. Each leaf’s estimated list is
 * qty_per × (component RSP + residual per unit). Net share is that list
 * over Σ leaf lists (equals set RSP when no leaf clamps at 0) — the same
 * as applying the set’s realized discount to every leaf.
 * When set RSP is missing, falls back to component-list share, then qty share.
 */
export function bundleLeafNetShares(
  components: SopBomComponent[],
  setRsp: number,
): BundleLeafShare[] {
  const leaves = components.filter((c) => {
    const qty = Number.isFinite(c.qty_per_bundle) ? c.qty_per_bundle : 0;
    return qty > 0;
  });
  if (leaves.length === 0) return [];

  const qtyTotal = leaves.reduce((sum, c) => sum + c.qty_per_bundle, 0);
  const componentList = leaves.reduce(
    (sum, c) => sum + c.qty_per_bundle * positivePrice(c.retail_price),
    0,
  );
  const setList = positivePrice(setRsp);
  const residualPerUnit =
    setList > 0 && qtyTotal > 0 ? (setList - componentList) / qtyTotal : 0;

  const rows = leaves.map((component) => {
    const qtyPerBundle = component.qty_per_bundle;
    const rsp = positivePrice(component.retail_price);
    const unitList = setList > 0 ? Math.max(0, rsp + residualPerUnit) : rsp;
    return {
      component,
      qtyPerBundle,
      leafList: qtyPerBundle * unitList,
    };
  });

  const listTotal = rows.reduce((sum, row) => sum + row.leafList, 0);
  if (listTotal <= 0) {
    return rows.map((row) => ({
      ...row,
      leafList: row.qtyPerBundle,
      share: row.qtyPerBundle / qtyTotal,
    }));
  }
  return rows.map((row) => ({
    ...row,
    share: row.leafList / listTotal,
  }));
}

type FranchiseWeights = {
  franchise: string;
  /** Component units per bundle sold. */
  qtyPerBundle: number;
  /** Leaf-list weight after set RSP + equal residual (fallback qty). */
  valueWeight: number;
};

/**
 * Collapse BOM lines into per-franchise weights for allocating bundle metrics.
 * Qty uses component units; net uses set-RSP + equal residual (fallback qty).
 */
export function bomFranchiseWeights(
  components: SopBomComponent[],
  setRsp = 0,
): FranchiseWeights[] {
  const shares = bundleLeafNetShares(bomLeafComponents(components), setRsp);
  const byFranchise = new Map<
    string,
    { qtyPerBundle: number; valueWeight: number }
  >();
  for (const part of shares) {
    const franchise =
      part.component.franchise_name?.trim() || UNMAPPED_FRANCHISE;
    const cur = byFranchise.get(franchise) ?? {
      qtyPerBundle: 0,
      valueWeight: 0,
    };
    cur.qtyPerBundle += part.qtyPerBundle;
    cur.valueWeight += part.leafList;
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
  return [...byFranchise.entries()].map(([franchise, w]) => ({
    franchise,
    qtyPerBundle: w.qtyPerBundle,
    valueWeight: w.valueWeight,
  }));
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
  setRsp?: number | null,
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

  const resolvedSetRsp = positivePrice(setRsp ?? row.retail_price);
  return bundleLeafNetShares(components, resolvedSetRsp).map((part) => ({
    sku_id: part.component.sku_id,
    sku_code: part.component.sku_code,
    name: null,
    franchise: part.component.franchise_name?.trim() || UNMAPPED_FRANCHISE,
    qty: qty * part.qtyPerBundle,
    post_tax: postTax * part.share,
    list_value: listValue * part.share,
  }));
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

function rspForMonth(row: SopSkuRow, month: number): number | null {
  return row.rsp_by_month?.[month] ?? row.retail_price;
}

/**
 * Copy of `rows` with bundle sell-out added onto leaf single SKUs.
 * Bundle rows stay as set units. Use this for SKU view only — franchise
 * view must keep raw actuals and explode bundles itself.
 */
export function withExplodedSingleActuals(
  rows: SopSkuRow[],
  bundleSources: SopSkuRow[] = rows,
): SopSkuRow[] {
  const extraBySku = new Map<
    string,
    {
      l3m_qty: number;
      l3m_post_tax: number;
      l6m_qty: number;
      l6m_post_tax: number;
      months: Partial<Record<number, { qty: number; post_tax: number }>>;
    }
  >();

  const extraOf = (skuId: string) => {
    let extra = extraBySku.get(skuId);
    if (!extra) {
      extra = {
        l3m_qty: 0,
        l3m_post_tax: 0,
        l6m_qty: 0,
        l6m_post_tax: 0,
        months: {},
      };
      extraBySku.set(skuId, extra);
    }
    return extra;
  };

  for (const row of bundleSources) {
    if (!row.is_bundle) continue;
    for (const part of allocateToComponentSkus(
      row,
      row.l3m_qty,
      row.l3m_post_tax,
      0,
      row.retail_price,
    )) {
      const extra = extraOf(part.sku_id);
      extra.l3m_qty += part.qty;
      extra.l3m_post_tax += part.post_tax;
    }
    for (const part of allocateToComponentSkus(
      row,
      row.l6m_qty,
      row.l6m_post_tax,
      0,
      row.retail_price,
    )) {
      const extra = extraOf(part.sku_id);
      extra.l6m_qty += part.qty;
      extra.l6m_post_tax += part.post_tax;
    }
    for (const month of MONTHS) {
      const actual = row.months[month]?.actual;
      if (!actual) continue;
      if ((actual.qty ?? 0) === 0 && (actual.post_tax_net ?? 0) === 0) {
        continue;
      }
      for (const part of allocateToComponentSkus(
        row,
        actual.qty,
        actual.post_tax_net,
        0,
        rspForMonth(row, month),
      )) {
        const extra = extraOf(part.sku_id);
        const cur = extra.months[month] ?? { qty: 0, post_tax: 0 };
        cur.qty += part.qty;
        cur.post_tax += part.post_tax;
        extra.months[month] = cur;
      }
    }
  }

  return rows.map((row) => {
    if (row.is_bundle) return row;
    const extra = extraBySku.get(row.sku_id);
    if (!extra) return row;
    const months = { ...row.months };
    for (const month of MONTHS) {
      const add = extra.months[month];
      if (!add) continue;
      const prev = months[month];
      const qty = (prev?.actual.qty ?? 0) + add.qty;
      const post_tax_net = (prev?.actual.post_tax_net ?? 0) + add.post_tax;
      months[month] = {
        actual: {
          qty,
          post_tax_net,
          avg_discount_pct: impliedDiscountPct(
            qty,
            rspForMonth(row, month),
            post_tax_net,
          ),
        },
        plan: prev?.plan ?? {
          projected_qty: 0,
          avg_discount_pct: 0,
          vat_in_net: 0,
          post_tax_net: 0,
          upload_id: null,
        },
      };
    }
    return {
      ...row,
      l3m_qty: row.l3m_qty + extra.l3m_qty,
      l3m_post_tax: row.l3m_post_tax + extra.l3m_post_tax,
      l6m_qty: row.l6m_qty + extra.l6m_qty,
      l6m_post_tax: row.l6m_post_tax + extra.l6m_post_tax,
      months,
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
  const weights = bomFranchiseWeights(
    row.bom_components ?? [],
    row.retail_price ?? 0,
  );
  const valueTotal = weights.reduce((s, w) => s + w.valueWeight, 0) || 1;
  return weights.map((w) => ({
    franchise: w.franchise,
    value: value * (w.valueWeight / valueTotal),
    qtyUnits: value * w.qtyPerBundle,
  }));
}
