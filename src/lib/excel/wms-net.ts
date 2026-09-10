import { isOfflineWmsChannel } from "@/lib/sales-forecast/constants";
import { parseWmsSalesNumber } from "@/lib/excel/sales-filters";

/**
 * Value stored on sales_records.net_sales for a WMS row.
 * Online: Subtotal − Diskon Per Barang − Diskon Lainnya (VAT-inclusive).
 * Offline (INTERNAL / DEALPOS): WMS Nett Sales, already post-tax.
 * If Sub Total is missing, fall back to Nett Sales.
 */
export function wmsStoredNetSales(input: {
  channel: string;
  subtotal: unknown;
  itemDiscount: unknown;
  otherDiscount: unknown;
  nettSales: unknown;
  hasSubtotalColumn: boolean;
}): number {
  const nettSales = parseWmsSalesNumber(input.nettSales);
  if (isOfflineWmsChannel(input.channel) || !input.hasSubtotalColumn) {
    return nettSales;
  }
  return (
    parseWmsSalesNumber(input.subtotal) -
    parseWmsSalesNumber(input.itemDiscount) -
    parseWmsSalesNumber(input.otherDiscount)
  );
}
