import type { ShipmentType } from "@/types/database";

export const SHIPMENT_DOCUMENT_TYPES = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "awb_label",
  "coo_form_fe",
  "pib",
  "sppb",
  "forwarder_invoice",
  "lartas",
] as const;

export type ShipmentDocumentType = (typeof SHIPMENT_DOCUMENT_TYPES)[number];

export type ShipmentDocumentVersionStatus = "draft" | "final";

export const SHIPMENT_DOCUMENT_LABELS: Record<ShipmentDocumentType, string> = {
  commercial_invoice: "Commercial Invoice",
  packing_list: "Packing List",
  bill_of_lading: "Bill of Lading",
  awb_label: "AWB Label",
  coo_form_fe: "COO/Form FE",
  pib: "PIB",
  sppb: "SPPB",
  forwarder_invoice: "Forwarder Invoice",
  lartas: "LARTAS",
};

export const SHIPMENT_DOCUMENT_VERSION_STATUS_LABELS: Record<
  ShipmentDocumentVersionStatus,
  string
> = {
  draft: "Draft",
  final: "Final",
};

export const SHIPMENT_DOCUMENT_VERSION_STATUS_STYLES: Record<
  ShipmentDocumentVersionStatus,
  string
> = {
  draft: "bg-amber-100 text-amber-800",
  final: "bg-emerald-100 text-emerald-800",
};

const SEA_DEFAULTS: ShipmentDocumentType[] = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "coo_form_fe",
  "pib",
  "sppb",
  "forwarder_invoice",
];

const AIR_DEFAULTS: ShipmentDocumentType[] = [
  "commercial_invoice",
  "packing_list",
  "awb_label",
  "coo_form_fe",
  "pib",
  "sppb",
  "forwarder_invoice",
];

const LOCAL_DEFAULTS: ShipmentDocumentType[] = [
  "commercial_invoice",
  "packing_list",
];

export function defaultRequiredDocuments(
  shipmentType: ShipmentType,
): ShipmentDocumentType[] {
  switch (shipmentType) {
    case "sea":
      return [...SEA_DEFAULTS];
    case "air":
      return [...AIR_DEFAULTS];
    case "local":
      return [...LOCAL_DEFAULTS];
  }
}

export function isShipmentDocumentType(
  value: string,
): value is ShipmentDocumentType {
  return (SHIPMENT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isShipmentDocumentVersionStatus(
  value: string,
): value is ShipmentDocumentVersionStatus {
  return value === "draft" || value === "final";
}
