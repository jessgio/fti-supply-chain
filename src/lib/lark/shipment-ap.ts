import {
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

function formatQty(qty: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    qty,
  );
}

export function shipmentPaymentParts(shipment: Shipment): {
  poNumbers: string[];
  productNames: string[];
  qty: number;
} {
  const poNumbers = [
    ...new Set(
      (shipment.purchase_orders ?? [])
        .map((po) => po.po_number?.trim())
        .filter((value): value is string => !!value),
    ),
  ];
  const items = (shipment.purchase_orders ?? []).flatMap((po) => po.items ?? []);
  const productNames = [
    ...new Set(
      items
        .map((item) => item.sku_name?.trim() || item.sku_code?.trim())
        .filter((value): value is string => !!value),
    ),
  ];
  const qty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return { poNumbers, productNames, qty };
}

/** Remarks for shipment AP forms: payment plan rows and the general remarks field. */
export function formatShipmentPaymentRemarks(shipment: Shipment): string {
  const { poNumbers, productNames, qty } = shipmentPaymentParts(shipment);
  const poPart = poNumbers.join(", ") || shipment.shipment_number;
  const products = productNames.join(", ");
  if (products) {
    return `Shipment payment for ${poPart} - ${products} for ${formatQty(qty)}`;
  }
  return `Shipment payment for ${poPart} for ${formatQty(qty)}`;
}

export function defaultShipmentApProject(shipment: Shipment): string {
  return shipment.shipment_number?.trim() || "Shipment";
}

export function defaultShipmentApSupplierText(
  invoiceKind: ShipmentApInvoiceKind,
  suppliers: Supplier[],
  selectedSupplierId?: string | null,
): string {
  if (invoiceKind === "shipping") {
    const selected = suppliers.find((s) => s.id === selectedSupplierId) ?? null;
    return formatSupplierPaymentDetails(selected) || selected?.name?.trim() || "";
  }
  const unique = new Map<string, Supplier>();
  for (const supplier of suppliers) {
    unique.set(supplier.id, supplier);
  }
  return [...unique.values()]
    .map((supplier) => formatSupplierPaymentDetails(supplier) || supplier.name)
    .filter((text) => text.trim())
    .join("\n\n");
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
