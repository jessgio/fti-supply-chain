const PROCUREMENT_LIST = "/dashboard/procurement";

export function poDetailPath(poId: string): string {
  return `${PROCUREMENT_LIST}/${poId}`;
}

/**
 * In-app path to send the PO back button to.
 * The procurement list is omitted so that page keeps its default
 * "All purchase orders" link, including when it was opened with a create prefill.
 */
export function sanitizePoReturnTo(
  value: string | null | undefined,
  poId?: string,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/dashboard/")) return null;
  if (trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("://")) {
    return null;
  }
  if (trimmed.includes("..")) return null;

  const withoutHash = trimmed.split("#")[0] ?? trimmed;
  const pathname = withoutHash.split("?")[0] ?? withoutHash;
  if (!pathname.startsWith("/dashboard/")) return null;
  if (pathname === PROCUREMENT_LIST || pathname === `${PROCUREMENT_LIST}/`) {
    return null;
  }
  if (
    poId &&
    (pathname === poDetailPath(poId) || pathname === `${poDetailPath(poId)}/`)
  ) {
    return null;
  }
  return withoutHash;
}

export function parsePoReturnTo(
  value: string | null,
  poId?: string,
): string | null {
  return sanitizePoReturnTo(value, poId);
}

function inheritedReturnTo(
  value: string | null | undefined,
  poId: string,
): string | null {
  if (!value) return null;
  const withoutHash = value.trim().split("#")[0] ?? "";
  const pathname = withoutHash.split("?")[0] ?? "";
  if (pathname !== poDetailPath(poId) && pathname !== `${poDetailPath(poId)}/`) {
    return null;
  }
  const query = withoutHash.split("?")[1];
  if (!query) return null;
  return sanitizePoReturnTo(new URLSearchParams(query).get("returnTo"), poId);
}

export function poDetailHref(poId: string, returnTo?: string | null): string {
  const base = poDetailPath(poId);
  const safe = sanitizePoReturnTo(returnTo, poId) ?? inheritedReturnTo(returnTo, poId);
  if (!safe) return base;
  return `${base}?returnTo=${encodeURIComponent(safe)}`;
}

export function dashboardLocation(pathname: string, search = ""): string {
  const query = search.replace(/^\?/, "");
  if (!pathname.startsWith("/")) return "/dashboard";
  return query ? `${pathname}?${query}` : pathname;
}

const RETURN_LABELS: { prefix: string; label: string; exact?: boolean }[] = [
  { prefix: "/dashboard/po-timeline", label: "Back to PO timeline" },
  { prefix: "/dashboard/timeline-adjustment", label: "Back to timeline adjustment" },
  { prefix: "/dashboard/shipment-payments/", label: "Back to shipment payment" },
  { prefix: "/dashboard/shipment-payments", label: "Back to shipment payments" },
  { prefix: "/dashboard/payments", label: "Back to payments" },
  { prefix: "/dashboard/status-updates", label: "Back to status updates" },
  { prefix: "/dashboard/shipments/", label: "Back to shipment" },
  { prefix: "/dashboard/shipments", label: "Back to shipments" },
  { prefix: "/dashboard/inbound", label: "Back to inbound receives" },
  {
    prefix: "/dashboard/extract-inbound-delivery-notes",
    label: "Back to extract inbound",
  },
  {
    prefix: "/dashboard/primary-packaging-delivery-notes",
    label: "Back to primary packaging inbound",
  },
  { prefix: "/dashboard/delivery-notes", label: "Back to delivery notes" },
  { prefix: "/dashboard/procurement/product-names", label: "Back to product names" },
  { prefix: "/dashboard/procurement/", label: "Back to purchase order" },
  { prefix: "/dashboard/procurement", label: "All purchase orders" },
  { prefix: "/dashboard/packaging", label: "Back to packaging" },
  { prefix: "/dashboard/extracts", label: "Back to extracts" },
  { prefix: "/dashboard/inventory", label: "Back to inventory" },
  { prefix: "/dashboard/insights", label: "Back to insights" },
  { prefix: "/dashboard/batches", label: "Back to stock batches" },
  { prefix: "/dashboard/product-development", label: "Back to product development" },
  { prefix: "/dashboard/notifications", label: "Back to notifications" },
  { prefix: "/dashboard", label: "Back to overview", exact: true },
];

function matchesReturnPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  const withSlash = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return pathname.startsWith(withSlash);
}

export function poReturnLabel(returnTo: string): string {
  const pathname =
    (returnTo.split("#")[0] ?? returnTo).split("?")[0] ?? returnTo;
  for (const rule of RETURN_LABELS) {
    if (rule.exact) {
      if (pathname === rule.prefix) return rule.label;
      continue;
    }
    if (matchesReturnPrefix(pathname, rule.prefix)) return rule.label;
  }
  return "Back";
}
