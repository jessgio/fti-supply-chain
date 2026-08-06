import type { PurchaseOrder } from "@/types/database";
import { DEFAULT_PO_CURRENCY } from "@/lib/procurement/currencies";
import { getRateToIdr, preloadRatesToIdr } from "@/lib/procurement/fx-rates";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";

export const OPEN_PO_STATUSES = [
  "planned",
  "ordered",
  "in_production",
  "in_transit",
] as const;

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

  const datesByCurrency = new Map<string, string[]>();
  for (const po of open) {
    const currency = (po.currency ?? DEFAULT_PO_CURRENCY).toUpperCase();
    if (currency === "IDR") continue;
    const list = datesByCurrency.get(currency) ?? [];
    list.push(poFxDate(po));
    datesByCurrency.set(currency, list);
  }

  await Promise.all(
    [...datesByCurrency.entries()].map(([currency, dates]) =>
      preloadRatesToIdr(currency, dates),
    ),
  );

  let totalIdr = 0;
  for (const po of open) {
    const currency = po.currency ?? DEFAULT_PO_CURRENCY;
    const amount = computePoInvoiceTotals(po).invoiceTotal;
    try {
      const rate = await getRateToIdr(currency, poFxDate(po));
      totalIdr += Math.round(amount * rate);
    } catch {
      // Skip POs whose FX rate cannot be resolved rather than failing the page.
    }
  }

  return totalIdr;
}
