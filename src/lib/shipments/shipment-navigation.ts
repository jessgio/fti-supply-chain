export function poDetailHref(poId: string): string {
  return `/dashboard/procurement/${poId}`;
}

export function shipmentDetailHref(
  shipmentId: string,
  returnTo?: string,
): string {
  const base = `/dashboard/shipments/${shipmentId}`;
  if (!returnTo) return base;
  return `${base}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function parseShipmentReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith("/dashboard/")) return null;
  return value;
}

export function shipmentReturnLabel(returnTo: string): string {
  if (returnTo.startsWith("/dashboard/procurement/")) {
    return "Back to purchase order";
  }
  if (returnTo.startsWith("/dashboard/po-timeline")) {
    return "Back to PO timeline";
  }
  if (returnTo.startsWith("/dashboard/procurement")) {
    return "Back to procurement";
  }
  return "Back";
}
