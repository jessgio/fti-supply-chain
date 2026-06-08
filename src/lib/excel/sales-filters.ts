const EXCLUDED_SALES_STATUSES = new Set(["CANCELED", "CANCELLED"]);

/** WMS exports RETURNED rows with positive QTY; they must subtract from totals. */
const RETURN_SALES_STATUSES = new Set([
  "RETURNED",
  "RETURN",
  "RETUR",
  "REFUND",
  "REFUNDED",
]);

function normalizeSalesToken(value: string): string {
  return value.trim().toUpperCase();
}

/** Parse WMS QTY / Nett Sales, preserving sign (never abs). */
export function parseWmsSalesNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  let raw = String(value ?? "").trim();
  if (!raw) return 0;

  // Excel / locale minus signs → ASCII hyphen
  raw = raw.replace(/[\u2212\u2013\u2014\uFE63\uFF0D]/g, "-");

  // Accounting negatives: (1,234.56)
  const accounting = raw.match(/^\(\s*([^)]+)\s*\)$/);
  if (accounting) {
    const cleaned = accounting[1].replace(/[^0-9.,]/g, "").replace(/,/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? -parsed : 0;
  }

  const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isReturnSalesStatus(
  status: string,
  tipeTransaksi = "",
): boolean {
  const s = normalizeSalesToken(status);
  const t = normalizeSalesToken(tipeTransaksi);

  if (s && RETURN_SALES_STATUSES.has(s)) return true;
  if (t && RETURN_SALES_STATUSES.has(t)) return true;

  if (s.includes("RETURN") || s.includes("RETUR") || s.includes("REFUND")) {
    return true;
  }
  if (t.includes("RETURN") || t.includes("RETUR")) return true;

  return false;
}

/** WMS sales rows: FAKTUR transactions; only CANCELED orders are excluded. */
export function isIncludedWmsSalesRow(
  tipeTransaksi: string,
  status: string,
): boolean {
  const normalizedStatus = normalizeSalesToken(status);
  if (EXCLUDED_SALES_STATUSES.has(normalizedStatus)) return false;

  // Returns may use a non-FAKTUR tipe in some WMS exports.
  if (isReturnSalesStatus(status, tipeTransaksi)) return true;

  const tipe = normalizeSalesToken(tipeTransaksi);
  if (tipe && tipe !== "FAKTUR") return false;
  return true;
}

function isReturnSalesRow(
  status: string,
  qty_sold: number,
  net_sales: number,
  tipeTransaksi = "",
): boolean {
  return (
    isReturnSalesStatus(status, tipeTransaksi) ||
    qty_sold < 0 ||
    net_sales < 0
  );
}

/** Flip positive return amounts negative; keep values that are already negative. */
function signedReturnAmount(value: number): number {
  if (value === 0) return 0;
  return value > 0 ? -Math.abs(value) : value;
}

/**
 * Franchise totals sum signed qty. Returns must stay negative:
 * - QTY / Nett Sales already negative in the file → keep as-is
 * - RETURNED status (or negative net) with positive QTY in the export → flip negative
 */
export function normalizeWmsSalesAmounts(
  status: string,
  qty_sold: number,
  net_sales: number,
  tipeTransaksi = "",
): { qty_sold: number; net_sales: number } {
  if (!isReturnSalesRow(status, qty_sold, net_sales, tipeTransaksi)) {
    return { qty_sold, net_sales };
  }

  return {
    qty_sold: signedReturnAmount(qty_sold),
    net_sales: signedReturnAmount(net_sales),
  };
}
