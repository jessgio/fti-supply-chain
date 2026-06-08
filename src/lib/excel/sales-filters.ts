const EXCLUDED_SALES_STATUSES = new Set(["CANCELED", "CANCELLED"]);

/** WMS exports RETURNED rows with positive QTY; they must subtract from totals. */
const RETURN_SALES_STATUSES = new Set(["RETURNED", "RETURN"]);

/** Parse WMS QTY / Nett Sales, preserving sign (never abs). */
export function parseWmsSalesNumber(value: unknown): number {
  if (typeof value === "number") return value;

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

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

/** WMS sales rows: FAKTUR transactions; only CANCELED orders are excluded. */
export function isIncludedWmsSalesRow(
  tipeTransaksi: string,
  status: string,
): boolean {
  const tipe = tipeTransaksi.trim().toUpperCase();
  if (tipe && tipe !== "FAKTUR") return false;

  const normalizedStatus = status.trim().toUpperCase();
  return !EXCLUDED_SALES_STATUSES.has(normalizedStatus);
}

function isReturnRow(
  status: string,
  qty_sold: number,
  net_sales: number,
): boolean {
  const normalizedStatus = status.trim().toUpperCase();
  return (
    RETURN_SALES_STATUSES.has(normalizedStatus) ||
    qty_sold < 0 ||
    net_sales < 0
  );
}

/**
 * Franchise totals sum signed qty. Returns must stay negative:
 * - QTY / Nett Sales already negative in the file → keep as-is
 * - RETURNED status with positive QTY in the export → flip to negative
 */
export function normalizeWmsSalesAmounts(
  status: string,
  qty_sold: number,
  net_sales: number,
): { qty_sold: number; net_sales: number } {
  if (!isReturnRow(status, qty_sold, net_sales)) {
    return { qty_sold, net_sales };
  }

  return {
    qty_sold: qty_sold > 0 ? -qty_sold : qty_sold,
    net_sales: net_sales > 0 ? -net_sales : net_sales,
  };
}
