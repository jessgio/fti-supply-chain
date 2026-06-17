import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";

export const DEFAULT_PO_TAX_PCT = 11;
export const DEFAULT_PO_PPH_PCT = 2;

function lineTotal(line: PurchaseOrderLine): number {
  return (line.unit_cost ?? 0) * line.qty_ordered;
}

export function poSubtotal(po: Pick<PurchaseOrder, "lines">): number {
  return (po.lines ?? []).reduce((sum, l) => sum + lineTotal(l), 0);
}

export interface PoInvoiceTotals {
  subtotal: number;
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
}

export function computePoInvoiceTotals(
  po: Pick<
    PurchaseOrder,
    "lines" | "discount_amount" | "tax_pct" | "pph_pct" | "other_charges"
  > & {
    down_payment_pct?: number;
  },
): PoInvoiceTotals {
  const subtotal = poSubtotal(po);
  const discount = Math.min(Math.max(0, po.discount_amount ?? 0), subtotal);
  const netBeforeTax = subtotal - discount;
  const taxPct = po.tax_pct ?? DEFAULT_PO_TAX_PCT;
  const tax = Math.round(netBeforeTax * (taxPct / 100));
  const pphPct = po.pph_pct ?? 0;
  const pph =
    pphPct > 0 ? Math.round(netBeforeTax * (pphPct / 100)) : 0;
  const otherCharges = Math.max(0, po.other_charges ?? 0);
  const invoiceTotal = netBeforeTax + tax + otherCharges - pph;
  const downPaymentPct = po.down_payment_pct ?? 30;
  const downPayment = Math.round(invoiceTotal * (downPaymentPct / 100));
  const finalPayment = invoiceTotal - downPayment;

  return {
    subtotal,
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
  };
}

export function taxLabel(taxPct: number): string {
  return `VAT (${taxPct}%)`;
}

export function pphLabel(pphPct: number): string {
  return `PPh (${pphPct}%)`;
}
