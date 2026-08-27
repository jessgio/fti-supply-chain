import { VAT_DIVISOR } from "@/lib/sales-forecast/constants";

export function clampDiscountPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** VAT-inclusive net sales from plan qty, RSP, and discount %. */
export function vatInclusiveNet(
  qty: number,
  retailPrice: number | null,
  discountPct: number,
): number {
  if (retailPrice == null || retailPrice <= 0 || !Number.isFinite(qty)) {
    return 0;
  }
  return qty * retailPrice * (1 - clampDiscountPct(discountPct) / 100);
}

export function postTaxNet(vatInclusive: number): number {
  if (!Number.isFinite(vatInclusive)) return 0;
  return vatInclusive / VAT_DIVISOR;
}

/** Convert WMS Nett Sales to the post-tax basis used in S&OP. */
export function postTaxFromWmsNet(netSales: number): number {
  if (!Number.isFinite(netSales)) return 0;
  return netSales / VAT_DIVISOR;
}

/**
 * Implied average discount % from actual qty × current RSP vs WMS post-tax net.
 * Returns null when discount cannot be inferred (no qty or RSP).
 */
export function impliedDiscountPct(
  qty: number,
  retailPrice: number | null,
  postTax: number,
): number | null {
  if (
    retailPrice == null ||
    retailPrice <= 0 ||
    !Number.isFinite(qty) ||
    qty <= 0 ||
    !Number.isFinite(postTax)
  ) {
    return null;
  }
  const listValue = qty * retailPrice;
  if (listValue <= 0) return null;
  const actualVatIn = postTax * VAT_DIVISOR;
  return clampDiscountPct(100 * (1 - actualVatIn / listValue));
}

/**
 * Weighted-average implied discount across SKUs that share a rollup cell.
 * `listValue` is Σ(qty × RSP); `postTax` is Σ(post-tax net).
 */
export function impliedDiscountPctFromList(
  listValue: number,
  postTax: number,
): number | null {
  if (!Number.isFinite(listValue) || listValue <= 0 || !Number.isFinite(postTax)) {
    return null;
  }
  const actualVatIn = postTax * VAT_DIVISOR;
  return clampDiscountPct(100 * (1 - actualVatIn / listValue));
}

export function remainingYearShortfall(
  remainingYearQty: number,
  onHand: number,
  onOrder: number,
): number {
  return Math.max(0, remainingYearQty - onHand - onOrder);
}
