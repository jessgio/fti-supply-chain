"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { HoverSnapshotLink } from "@/components/ui/hover-snapshot-link";
import type { PoTimelineLineItem } from "@/components/procurement/po-timeline-po-link";
import { poDetailHref } from "@/lib/procurement/po-navigation";
import { useDashboardReturnPath } from "@/lib/procurement/use-dashboard-return-path";

interface PoHoverLinkProps {
  poId: string;
  poNumber: string;
  lineItems?: PoTimelineLineItem[];
  className?: string;
}

export function PoHoverLink(props: PoHoverLinkProps) {
  const pathname = usePathname() ?? "";
  return (
    <Suspense fallback={<PoHoverLinkView {...props} returnPath={pathname} />}>
      <PoHoverLinkResolved {...props} />
    </Suspense>
  );
}

function PoHoverLinkResolved(props: PoHoverLinkProps) {
  const returnPath = useDashboardReturnPath();
  return <PoHoverLinkView {...props} returnPath={returnPath} />;
}

function PoHoverLinkView({
  poId,
  poNumber,
  lineItems,
  className = "shrink-0 font-semibold text-rose-700 hover:underline",
  returnPath,
}: PoHoverLinkProps & { returnPath: string }) {
  const href = poDetailHref(poId, returnPath);

  if (lineItems && lineItems.length > 0) {
    return (
      <HoverSnapshotLink
        href={href}
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
      href={href}
      label={poNumber}
      snapshotUrl={`/api/procurement/pos/${poId}/snapshot`}
      className={className}
    />
  );
}
