"use client";

import { HoverSnapshotLink } from "@/components/ui/hover-snapshot-link";

interface ShipmentHoverLinkProps {
  shipmentId: string;
  shipmentNumber: string;
  className?: string;
}

export function ShipmentHoverLink({
  shipmentId,
  shipmentNumber,
  className = "font-medium text-stone-900 hover:underline",
}: ShipmentHoverLinkProps) {
  return (
    <HoverSnapshotLink
      href={`/dashboard/shipments/${shipmentId}`}
      label={shipmentNumber}
      snapshotUrl={`/api/shipments/${shipmentId}/snapshot`}
      className={className}
    />
  );
}
