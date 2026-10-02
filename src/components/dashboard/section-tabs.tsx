"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

const SUPPLY_CHAIN: UserRole[] = ["admin", "supply_chain"];
const TIMELINE_ROLES: UserRole[] = ["admin", "supply_chain", "viewer"];

/** Segments under /dashboard/extracts that are their own tools, not a ledger record. */
const EXTRACT_TOOL_SEGMENTS = new Set(["formulas", "calculator", "mappings"]);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isExtractLedger(pathname: string): boolean {
  if (pathname === "/dashboard/extracts") return true;
  if (!pathname.startsWith("/dashboard/extracts/")) return false;
  const segment = pathname.slice("/dashboard/extracts/".length).split("/")[0];
  return segment.length > 0 && !EXTRACT_TOOL_SEGMENTS.has(segment);
}

interface SectionTab {
  href: string;
  label: string;
  roles?: UserRole[];
  match: (pathname: string) => boolean;
}

/**
 * In-page switches for tools that used to be separate sidebar links.
 * Each route stays its own page so the client bundle does not grow.
 */
const SECTIONS: SectionTab[][] = [
  [
    {
      href: "/dashboard/sales-forecast",
      label: "Forecast",
      match: (pathname) => matchesPrefix(pathname, "/dashboard/sales-forecast"),
    },
    {
      href: "/dashboard/sales-accuracy",
      label: "Accuracy",
      match: (pathname) => matchesPrefix(pathname, "/dashboard/sales-accuracy"),
    },
  ],
  [
    {
      href: "/dashboard/po-timeline",
      label: "PO timeline",
      roles: TIMELINE_ROLES,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/po-timeline"),
    },
    {
      href: "/dashboard/timeline-adjustment",
      label: "Adjustments",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/timeline-adjustment"),
    },
  ],
  [
    {
      href: "/dashboard/payments",
      label: "PO payments",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/payments"),
    },
    {
      href: "/dashboard/shipment-payments",
      label: "Shipment payments",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/shipment-payments"),
    },
  ],
  [
    {
      href: "/dashboard/extract-inbound-delivery-notes",
      label: "Extract",
      roles: SUPPLY_CHAIN,
      match: (pathname) =>
        matchesPrefix(pathname, "/dashboard/extract-inbound-delivery-notes"),
    },
    {
      href: "/dashboard/primary-packaging-delivery-notes",
      label: "Primary packaging",
      roles: SUPPLY_CHAIN,
      match: (pathname) =>
        matchesPrefix(pathname, "/dashboard/primary-packaging-delivery-notes"),
    },
    {
      href: "/dashboard/delivery-notes",
      label: "Secondary packaging",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/delivery-notes"),
    },
  ],
  [
    {
      href: "/dashboard/extracts",
      label: "Ledger",
      roles: SUPPLY_CHAIN,
      match: isExtractLedger,
    },
    {
      href: "/dashboard/extracts/formulas",
      label: "Formulas",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/extracts/formulas"),
    },
    {
      href: "/dashboard/extracts/calculator",
      label: "Calculator",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/extracts/calculator"),
    },
    {
      href: "/dashboard/extracts/mappings",
      label: "Action codes",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/extracts/mappings"),
    },
  ],
  [
    {
      href: "/dashboard/packaging",
      label: "Materials",
      roles: SUPPLY_CHAIN,
      match: (pathname) => pathname === "/dashboard/packaging",
    },
    {
      href: "/dashboard/packaging/links",
      label: "BOM",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/packaging/links"),
    },
  ],
  [
    {
      href: "/dashboard/mappings",
      label: "SKUs",
      match: (pathname) => pathname === "/dashboard/mappings",
    },
    {
      href: "/dashboard/mappings/cogs",
      label: "COGS",
      roles: SUPPLY_CHAIN,
      match: (pathname) => matchesPrefix(pathname, "/dashboard/mappings/cogs"),
    },
  ],
  [
    {
      href: "/dashboard/product-development/projects",
      label: "Projects",
      roles: SUPPLY_CHAIN,
      match: (pathname) =>
        pathname === "/dashboard/product-development" ||
        matchesPrefix(pathname, "/dashboard/product-development/projects"),
    },
    {
      href: "/dashboard/product-development/formula-tracker",
      label: "Formula tracker",
      roles: SUPPLY_CHAIN,
      match: (pathname) =>
        matchesPrefix(pathname, "/dashboard/product-development/formula-tracker"),
    },
  ],
];

function roleCanSee(tab: SectionTab, role: UserRole | null): boolean {
  return !tab.roles || !role || tab.roles.includes(role);
}

interface SectionTabsProps {
  role: UserRole | null;
}

export function SectionTabs({ role }: SectionTabsProps) {
  const pathname = usePathname();
  const section = SECTIONS.find((tabs) => tabs.some((tab) => tab.match(pathname)));
  if (!section) return null;

  const tabs = section.filter((tab) => roleCanSee(tab, role));
  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label="Section"
      className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur"
    >
      <div className="flex gap-1 overflow-x-auto px-6 lg:px-8">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-stone-500 hover:text-stone-800",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
