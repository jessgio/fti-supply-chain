"use client";

import { HoverSnapshotLink } from "@/components/ui/hover-snapshot-link";
import type { PoTimelineLineItem } from "@/components/procurement/po-timeline-po-link";

interface PoHoverLinkProps {
  poId: string;
  poNumber: string;
  lineItems?: PoTimelineLineItem[];
  className?: string;
}

export function PoHoverLink({
  poId,
  poNumber,
  lineItems,
  className = "shrink-0 font-semibold text-rose-700 hover:underline",
}: PoHoverLinkProps) {
  if (lineItems && lineItems.length > 0) {
    return (
      <HoverSnapshotLink
        href={`/dashboard/procurement/${poId}`}
        label={poNumber}
        title={poNumber}
        subtitle="Line items"
        snapshotUrl={`/api/procurement/pos/${poId}/snapshot`}
        className={className}
        mapSnapshot={() => ({
          title: poNumber,
          subtitle: "Line items",
          lines: lineItems.map((item) => ({
            sku_code: item.sku_code,
            sku_name: item.sku_name,
            quantity: item.qty_ordered,
            label:
              item.qty_received != null && item.qty_received > 0
                ? `${item.qty_received.toLocaleString()} received`
                : undefined,
          })),
        })}
      />
    );
  }

  return (
    <HoverSnapshotLink
      href={`/dashboard/procurement/${poId}`}
      label={poNumber}
      snapshotUrl={`/api/procurement/pos/${poId}/snapshot`}
      className={className}
    />
  );
}
