const EXCLUDED_SALES_STATUSES = new Set(["CANCELED", "CANCELLED"]);

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
