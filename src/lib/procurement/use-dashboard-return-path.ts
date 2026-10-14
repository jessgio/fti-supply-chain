"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { dashboardLocation } from "@/lib/procurement/po-navigation";

export function useDashboardReturnPath(): string {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  return dashboardLocation(pathname, searchParams.toString());
}
