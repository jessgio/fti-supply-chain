import type { PurchaseOrder } from "@/types/database";
import { DEFAULT_PO_CURRENCY } from "@/lib/procurement/currencies";
import { getRateToIdr } from "@/lib/procurement/fx-rates";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";

export const OPEN_PO_STATUSES = ["planned", "ordered", "in_transit"] as const;

export function isOpenPo(po: PurchaseOrder): boolean {
  return (OPEN_PO_STATUSES as readonly string[]).includes(po.status);
}

/** Date used for FX lookup: order date, else PO creation date. */
export function poFxDate(po: PurchaseOrder): string {
  if (po.order_date) return po.order_date;
  if (po.created_at) return po.created_at.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export async function computeOpenPoValueIdr(
  pos: PurchaseOrder[],
): Promise<number> {
  const open = pos.filter(isOpenPo);
  const ratePromises = new Map<string, Promise<number>>();

  async function rateFor(currency: string, date: string): Promise<number> {
    const key = `${currency}:${date}`;
    if (!ratePromises.has(key)) {
      ratePromises.set(key, getRateToIdr(currency, date));
    }
    return ratePromises.get(key)!;
  }

  let totalIdr = 0;
  for (const po of open) {
    const currency = po.currency ?? DEFAULT_PO_CURRENCY;
    const amount = computePoInvoiceTotals(po).invoiceTotal;
    const rate = await rateFor(currency, poFxDate(po));
    totalIdr += Math.round(amount * rate);
  }

  return totalIdr;
}
