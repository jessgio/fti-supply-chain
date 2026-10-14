"use client";

import { Suspense, type MouseEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { poDetailHref } from "@/lib/procurement/po-navigation";
import { useDashboardReturnPath } from "@/lib/procurement/use-dashboard-return-path";

interface PoDetailLinkProps {
  poId: string;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function PoDetailLink(props: PoDetailLinkProps) {
  const pathname = usePathname() ?? "";
  return (
    <Suspense fallback={<PoDetailAnchor {...props} returnPath={pathname} />}>
      <PoDetailLinkResolved {...props} />
    </Suspense>
  );
}

function PoDetailLinkResolved(props: PoDetailLinkProps) {
  const returnPath = useDashboardReturnPath();
  return <PoDetailAnchor {...props} returnPath={returnPath} />;
}

function PoDetailAnchor({
  poId,
  className,
  children,
  onClick,
  returnPath,
}: PoDetailLinkProps & { returnPath: string }) {
  return (
    <Link
      href={poDetailHref(poId, returnPath)}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
