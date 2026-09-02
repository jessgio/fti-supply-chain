import { VAT_DIVISOR } from "@/lib/sales-forecast/constants";

export function clampDiscountPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** VAT-inclusive net sales from plan qty, RSP (incl. VAT), and discount %. */
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

/** Convert VAT-inclusive planned net to post-tax (÷ 1.11). */
export function postTaxNet(vatInclusive: number): number {
  if (!Number.isFinite(vatInclusive)) return 0;
  return vatInclusive / VAT_DIVISOR;
}

/**
 * WMS "Nett Sales" is already post-tax (PPN excluded).
 * Returning it unchanged keeps S&OP actuals on the same basis as the file;
 * dividing by 1.11 here would strip VAT a second time.
 */
export function postTaxFromWmsNet(netSales: number): number {
  if (!Number.isFinite(netSales)) return 0;
  return netSales;
}

/**
 * Implied average discount % from actual qty × VAT-inclusive RSP vs post-tax net.
 * Reconstructs VAT-inclusive proceeds (post-tax × 1.11) before comparing to list.
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

/**
 * Percent change vs a baseline (e.g. L3M monthly average).
 * Positive = above baseline (bullish); negative = below (conservative).
 * Returns null when baseline ≤ 0.
 */
export function pctVsBaseline(value: number, baseline: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline <= 0) {
    return null;
  }
  return ((value - baseline) / baseline) * 100;
}

/**
 * Linear EOM run-rate from month-to-date: (mtd / dayOfMonth) × daysInMonth.
 */
export function eomProjectionFromMtd(
  mtd: number,
  asOf: Date = new Date(),
): number {
  if (!Number.isFinite(mtd) || mtd < 0) return 0;
  const day = asOf.getDate();
  if (day <= 0) return 0;
  const daysInMonth = new Date(
    asOf.getFullYear(),
    asOf.getMonth() + 1,
    0,
  ).getDate();
  return (mtd / day) * daysInMonth;
}

/** EOM projection as % of forecast input (100 = on track to hit plan). */
export function eomVsForecastPct(
  eomProjected: number,
  forecast: number,
): number | null {
  if (!Number.isFinite(eomProjected) || !Number.isFinite(forecast) || forecast <= 0) {
    return null;
  }
  return (eomProjected / forecast) * 100;
}
