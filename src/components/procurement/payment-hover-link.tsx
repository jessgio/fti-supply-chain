"use client";

import { HoverSnapshotLink } from "@/components/ui/hover-snapshot-link";

interface PaymentHoverLinkProps {
  paymentId: string;
  label: string;
  poId?: string;
  className?: string;
}

export function PaymentHoverLink({
  paymentId,
  label,
  poId,
  className = "font-medium text-stone-900 hover:underline",
}: PaymentHoverLinkProps) {
  return (
    <HoverSnapshotLink
      href={poId ? `/dashboard/procurement/${poId}` : `/dashboard/payments`}
      label={label}
      snapshotUrl={`/api/payments/${paymentId}/snapshot`}
      className={className}
    />
  );
}
