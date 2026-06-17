import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";

export const DEFAULT_PO_TAX_PCT = 11;
export const DEFAULT_PO_PPH_PCT = 2;

function lineAmount(qty: number, line: PurchaseOrderLine): number {
  return (line.unit_cost ?? 0) * qty;
}

/** Whether invoice totals should use received quantities (short-closed POs). */
export function usesBilledQuantities(
  po: { status?: PurchaseOrder["status"] },
): boolean {
  return po.status === "received";
}

export function billableLineQty(
  line: PurchaseOrderLine,
  po: { status?: PurchaseOrder["status"] },
): number {
  return usesBilledQuantities(po) ? line.qty_received : line.qty_ordered;
}

export function poSubtotal(po: Pick<PurchaseOrder, "lines">): number {
  return (po.lines ?? []).reduce(
    (sum, l) => sum + lineAmount(l.qty_ordered, l),
    0,
  );
}

export function poBilledSubtotal(
  po: Pick<PurchaseOrder, "lines"> & { status?: PurchaseOrder["status"] },
): number {
  return (po.lines ?? []).reduce(
    (sum, l) => sum + lineAmount(billableLineQty(l, po), l),
    0,
  );
}

function billingScale(
  po: Pick<PurchaseOrder, "lines"> & { status?: PurchaseOrder["status"] },
): number {
  if (!usesBilledQuantities(po)) return 1;
  const ordered = poSubtotal(po);
  const billed = poBilledSubtotal(po);
  if (ordered <= 0) return 1;
  return billed / ordered;
}

export interface PoInvoiceTotals {
  subtotal: number;
  orderedSubtotal: number;
  discount: number;
  netBeforeTax: number;
  taxPct: number;
  tax: number;
  pphPct: number;
  pph: number;
  otherCharges: number;
  invoiceTotal: number;
  downPaymentPct: number;
  downPayment: number;
  finalPayment: number;
  isShortReceived: boolean;
}

export function computePoInvoiceTotals(
  po: Pick<
    PurchaseOrder,
    "lines" | "discount_amount" | "tax_pct" | "pph_pct" | "other_charges"
  > & {
    status?: PurchaseOrder["status"];
    down_payment_pct?: number;
  },
): PoInvoiceTotals {
  const orderedSubtotal = poSubtotal(po);
  const subtotal = poBilledSubtotal(po);
  const scale = billingScale(po);
  const rawDiscount = po.discount_amount ?? 0;
  const discount = Math.min(
    Math.max(0, usesBilledQuantities(po) ? rawDiscount * scale : rawDiscount),
    subtotal,
  );
  const netBeforeTax = subtotal - discount;
  const taxPct = po.tax_pct ?? DEFAULT_PO_TAX_PCT;
  const tax = Math.round(netBeforeTax * (taxPct / 100));
  const pphPct = po.pph_pct ?? 0;
  const pph =
    pphPct > 0 ? Math.round(netBeforeTax * (pphPct / 100)) : 0;
  const rawOther = po.other_charges ?? 0;
  const otherCharges = Math.max(
    0,
    usesBilledQuantities(po) ? rawOther * scale : rawOther,
  );
  const invoiceTotal = netBeforeTax + tax + otherCharges - pph;
  const downPaymentPct = po.down_payment_pct ?? 30;
  const downPayment = Math.round(invoiceTotal * (downPaymentPct / 100));
  const finalPayment = invoiceTotal - downPayment;
  const isShortReceived =
    usesBilledQuantities(po) &&
    (po.lines ?? []).some((l) => l.qty_received < l.qty_ordered);

  return {
    subtotal,
    orderedSubtotal,
    discount,
    netBeforeTax,
    taxPct,
    tax,
    pphPct,
    pph,
    otherCharges,
    invoiceTotal,
    downPaymentPct,
    downPayment,
    finalPayment,
    isShortReceived,
  };
}

export function taxLabel(taxPct: number): string {
  return `VAT (${taxPct}%)`;
}

export function pphLabel(pphPct: number): string {
  return `PPh (${pphPct}%)`;
}

export function poLineIsComplete(line: PurchaseOrderLine): boolean {
  return line.is_closed || line.qty_received >= line.qty_ordered;
}

export function poLineOpenQty(line: PurchaseOrderLine): number {
  if (line.is_closed) return 0;
  return Math.max(0, line.qty_ordered - line.qty_received);
}
