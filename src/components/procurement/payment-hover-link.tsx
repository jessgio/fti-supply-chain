"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { HoverSnapshotLink } from "@/components/ui/hover-snapshot-link";
import { poDetailHref } from "@/lib/procurement/po-navigation";
import { useDashboardReturnPath } from "@/lib/procurement/use-dashboard-return-path";

interface PaymentHoverLinkProps {
  paymentId: string;
  label: string;
  poId?: string;
  className?: string;
}

export function PaymentHoverLink(props: PaymentHoverLinkProps) {
  const pathname = usePathname() ?? "";
  return (
    <Suspense
      fallback={<PaymentHoverLinkView {...props} returnPath={pathname} />}
    >
      <PaymentHoverLinkResolved {...props} />
    </Suspense>
  );
}

function PaymentHoverLinkResolved(props: PaymentHoverLinkProps) {
  const returnPath = useDashboardReturnPath();
  return <PaymentHoverLinkView {...props} returnPath={returnPath} />;
}

function PaymentHoverLinkView({
  paymentId,
  label,
  poId,
  className = "font-medium text-stone-900 hover:underline",
  returnPath,
}: PaymentHoverLinkProps & { returnPath: string }) {
  return (
    <HoverSnapshotLink
      href={poId ? poDetailHref(poId, returnPath) : "/dashboard/payments"}
      label={label}
      snapshotUrl={`/api/payments/${paymentId}/snapshot`}
      className={className}
    />
  );
}
