"use client";

import { HoverSnapshotLink } from "@/components/ui/hover-snapshot-link";
import { shipmentDetailHref } from "@/lib/shipments/shipment-navigation";

interface ShipmentHoverLinkProps {
  shipmentId: string;
  shipmentNumber: string;
  returnTo?: string;
  className?: string;
}

export function ShipmentHoverLink({
  shipmentId,
  shipmentNumber,
  returnTo,
  className = "font-medium text-stone-900 hover:underline",
}: ShipmentHoverLinkProps) {
  return (
    <HoverSnapshotLink
      href={shipmentDetailHref(shipmentId, returnTo)}
      label={shipmentNumber}
      snapshotUrl={`/api/shipments/${shipmentId}/snapshot`}
      className={className}
    />
  );
}
