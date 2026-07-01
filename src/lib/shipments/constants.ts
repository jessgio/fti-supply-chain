export const SHIPMENT_TYPES = ["sea", "air", "local"] as const;
export type ShipmentType = (typeof SHIPMENT_TYPES)[number];

export const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  sea: "Sea",
  air: "Air",
  local: "Local",
};

export const SHIPMENT_STATUSES = [
  "planned",
  "in_transit",
  "delivered",
  "closed",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  planned: "Planned",
  in_transit: "In transit",
  delivered: "Delivered",
  closed: "Closed",
};

export const SHIPMENT_STATUS_STYLES: Record<ShipmentStatus, string> = {
  planned: "bg-stone-100 text-stone-700",
  in_transit: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  closed: "bg-stone-200 text-stone-600",
};

export const DEFAULT_TRANSIT_DAYS: Record<ShipmentType, number> = {
  sea: 21,
  air: 7,
  local: 3,
};

export function isShipmentClosed(status: ShipmentStatus): boolean {
  return status === "closed";
}

export const INBOUND_STATUSES = ["pending", "partial", "complete"] as const;
export type InboundReceiveStatus = (typeof INBOUND_STATUSES)[number];

export const INBOUND_STATUS_LABELS: Record<InboundReceiveStatus, string> = {
  pending: "Pending",
  partial: "Partial",
  complete: "Complete",
};

export const INBOUND_STATUS_STYLES: Record<InboundReceiveStatus, string> = {
  pending: "bg-stone-100 text-stone-700",
  partial: "bg-amber-100 text-amber-800",
  complete: "bg-emerald-100 text-emerald-800",
};

/** PO statuses shown on the master timeline (ongoing orders). */
export const TIMELINE_PO_STATUSES = [
  "planned",
  "ordered",
  "in_production",
  "in_transit",
] as const;

export const PO_TIMELINE_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  ordered: "Ordered",
  in_production: "In production",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
  partially_received: "Partially received",
  shipped: "Shipped",
};

export const PO_TIMELINE_STATUS_STYLES: Record<string, string> = {
  planned: "bg-stone-100 text-stone-700",
  ordered: "bg-blue-100 text-blue-800",
  in_production: "bg-indigo-100 text-indigo-800",
  in_transit: "bg-violet-100 text-violet-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-stone-200 text-stone-500",
  partially_received: "bg-rose-100 text-rose-800",
  shipped: "bg-violet-100 text-violet-800",
};
