const EXCLUDED_SALES_STATUSES = new Set(["CANCELED", "CANCELLED"]);

function normalizeSalesToken(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Parse WMS QTY / Nett Sales, preserving sign exactly as stored in the file.
 * Returns already arrive negative (Tipe Transaksi = RETUR); they must stay negative.
 */
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

/**
 * Include every WMS row except CANCELED orders. Sales (FAKTUR, positive) and
 * returns (RETUR, already negative in the file) both count toward totals;
 * a returned order's positive invoice and negative return net out naturally.
 */
export function isIncludedWmsSalesRow(
  _tipeTransaksi: string,
  status: string,
): boolean {
  return !EXCLUDED_SALES_STATUSES.has(normalizeSalesToken(status));
}
