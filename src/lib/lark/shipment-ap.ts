import {
  formatSkuQuantityLabel,
  isApFormCurrency,
  localTodayYmd,
  type ApFormCurrency,
  type PaymentPlanRow,
} from "@/lib/lark/ap-form";
import { formatSupplierPaymentDetails } from "@/lib/procurement/supplier-po-notes";
import type { Shipment, ShipmentApInvoiceKind, Supplier } from "@/types/database";

export type { ShipmentApInvoiceKind };

export const SHIPMENT_AP_INVOICE_KINDS = ["tax", "shipping"] as const;

export const SHIPMENT_AP_INVOICE_LABELS: Record<ShipmentApInvoiceKind, string> = {
  tax: "Tax invoice",
  shipping: "Shipping invoice",
};

export function isShipmentApInvoiceKind(
  value: string,
): value is ShipmentApInvoiceKind {
  return (SHIPMENT_AP_INVOICE_KINDS as readonly string[]).includes(value);
}

/** Prefill for tax AP payment details — paid to DJBC, not the PO supplier. */
export const TAX_AP_PAYMENT_DETAILS_TEMPLATE = "NOMOR BILLING: \nDOCUMENT: ";

/** Default DJBC account lines on a tax / PIB payment plan. Amounts stay empty. */
export const DEFAULT_TAX_AP_DUTY_LINES = [
  "411212 - PPN Import",
  "411123 - PPH Impor",
  "412111 - Bea Masuk",
] as const;

function shipmentItems(shipment: Shipment) {
  return (shipment.purchase_orders ?? []).flatMap((po) => po.items ?? []);
}

export function shipmentPaymentParts(shipment: Shipment): {
  poNumbers: string[];
  productNames: string[];
  qty: number;
  /** Per-SKU ordered/shipped quantity. Stays after the PO is inbounded. */
  goodsDescription: string;
} {
  const poNumbers = [
    ...new Set(
      (shipment.purchase_orders ?? [])
        .map((po) => po.po_number?.trim())
        .filter((value): value is string => !!value),
    ),
  ];
  const items = shipmentItems(shipment);
  const productNames = [
    ...new Set(
      items
        .map((item) => item.sku_name?.trim() || item.sku_code?.trim())
        .filter((value): value is string => !!value),
    ),
  ];
  const qty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const goodsDescription = items
    .map((item) =>
      formatSkuQuantityLabel({
        skuCode: item.sku_code,
        skuName: item.sku_name,
        quantity: item.quantity,
      }),
    )
    .filter((part): part is string => !!part)
    .join(", ");
  return { poNumbers, productNames, qty, goodsDescription };
}

/** SKU and shipped quantity for each line. Inbound does not remove these. */
export function formatShipmentGoodsDescription(shipment: Shipment): string {
  return shipmentPaymentParts(shipment).goodsDescription;
}

/** Keep the goods description on a shipment AP field when a prefill left it out. */
export function appendShipmentGoods(
  text: string,
  shipment: Shipment,
  separator = "\n",
): string {
  const items = formatShipmentGoodsDescription(shipment);
  const base = text.trim();
  if (!items) return base;
  if (base.includes(items)) return base;
  return base ? `${base}${separator}${items}` : items;
}

/** Remarks for shipment AP forms: payment plan rows and the general remarks field. */
export function formatShipmentPaymentRemarks(
  shipment: Shipment,
  invoiceKind: ShipmentApInvoiceKind = "shipping",
): string {
  const { poNumbers, goodsDescription, qty } = shipmentPaymentParts(shipment);
  const poPart = poNumbers.join(", ") || shipment.shipment_number;
  const kindLabel =
    invoiceKind === "tax" ? "PIB payment" : "Shipment payment";
  if (goodsDescription) {
    return `${kindLabel} for ${poPart} - ${goodsDescription}`;
  }
  const total = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(qty);
  return `${kindLabel} for ${poPart} for ${total}`;
}

export function shipmentPoLabel(shipment: Shipment): string {
  const { poNumbers } = shipmentPaymentParts(shipment);
  return poNumbers.join(", ") || shipment.shipment_number;
}

export function defaultShipmentApProject(shipment: Shipment): string {
  return shipment.shipment_number?.trim() || "Shipment";
}

export function defaultShipmentApSupplierText(
  invoiceKind: ShipmentApInvoiceKind,
  suppliers: Supplier[],
  selectedSupplierId?: string | null,
): string {
  if (invoiceKind === "tax") {
    return TAX_AP_PAYMENT_DETAILS_TEMPLATE;
  }
  const selected = suppliers.find((s) => s.id === selectedSupplierId) ?? null;
  return formatSupplierPaymentDetails(selected) || selected?.name?.trim() || "";
}

export function buildShipmentPaymentPlanRow(input: {
  remarks: string;
  amount: number;
  currency: string;
  dateYmd?: string;
}): PaymentPlanRow {
  const currency = isApFormCurrency(input.currency) ? input.currency : "IDR";
  const amount =
    currency === "IDR"
      ? Math.round(input.amount)
      : Math.round(input.amount * 100) / 100;
  return {
    dateYmd: input.dateYmd || localTodayYmd(),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    currency: currency as ApFormCurrency,
    remarks: input.remarks,
  };
}

export function defaultTaxApPaymentPlanRows(
  poLabel: string,
  goodsDescription?: string | null,
): PaymentPlanRow[] {
  const suffix = [poLabel.trim(), goodsDescription?.trim()]
    .filter((part): part is string => !!part)
    .join(" - ");
  return DEFAULT_TAX_AP_DUTY_LINES.map((line) =>
    buildShipmentPaymentPlanRow({
      remarks: suffix ? `${line}, ${suffix}` : line,
      amount: 0,
      currency: "IDR",
    }),
  );
}
