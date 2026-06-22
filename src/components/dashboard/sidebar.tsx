"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  FlaskConical,
  GanttChart,
  LayoutDashboard,
  Layers,
  Lightbulb,
  CalendarClock,
  Link2,
  LogOut,
  Banknote,
  Package,
  PackageCheck,
  PanelLeft,
  PanelLeftClose,
  ShoppingCart,
  TrendingUp,
  Truck,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import type { UserRole } from "@/types/database";

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
  /** When true, only highlight on exact path match (not sub-routes). */
  exact?: boolean;
}

const links: NavLink[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/sales", label: "Sales Growth", icon: BarChart3 },
  { href: "/dashboard/commercial", label: "Sales & Marketing", icon: TrendingUp },
  { href: "/dashboard/inventory", label: "Inventory & Forecast", icon: Package },
  { href: "/dashboard/insights", label: "Supply Chain Insights", icon: Lightbulb },
  {
    href: "/dashboard/procurement",
    label: "Procurement",
    icon: ShoppingCart,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/po-timeline",
    label: "PO Timeline",
    icon: GanttChart,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/shipments",
    label: "Shipments",
    icon: Truck,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/inbound",
    label: "Inbound Receives",
    icon: PackageCheck,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/batches",
    label: "Stock Batches",
    icon: CalendarClock,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/payments",
    label: "PO Payments",
    icon: Banknote,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/extracts",
    label: "Extracts",
    icon: FlaskConical,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/extracts/mappings",
    label: "Extract Mappings",
    icon: Link2,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/packaging",
    label: "Packaging",
    icon: Layers,
    roles: ["admin", "supply_chain"],
    exact: true,
  },
  {
    href: "/dashboard/packaging/links",
    label: "Packaging BOM",
    icon: Link2,
    roles: ["admin", "supply_chain"],
  },
  {
    href: "/dashboard/uploads",
    label: "Data Uploads",
    icon: Upload,
    roles: ["admin", "supply_chain"],
  },
  { href: "/dashboard/mappings", label: "SKU Mappings", icon: Boxes },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  supply_chain: "Supply Chain",
  sales_marketing: "Sales & Marketing",
  viewer: "Viewer",
};

interface SidebarProps {
  role?: UserRole | null;
  displayName?: string | null;
  email?: string | null;
}

export function Sidebar({ role, displayName, email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed } = useSidebar();

  const visibleLinks = links.filter(
    (link) => !link.roles || !role || link.roles.includes(role),
  );

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-stone-200 bg-stone-50 transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-[clamp(11rem,16vw,16rem)]",
      )}
    >
      <div
        className={cn(
          "border-b border-stone-200",
          collapsed ? "px-2 py-4" : "px-5 py-6",
        )}
      >
        <div
          className={cn(
            "flex items-start",
            collapsed ? "flex-col items-center gap-2" : "justify-between gap-2",
          )}
        >
          <div className={cn(collapsed && "text-center")}>
            {collapsed ? (
              <p
                className="text-xs font-bold text-emerald-800"
                title="From This Island — Supply Chain"
              >
                FTI
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  From This Island
                </p>
                <h1 className="mt-1 text-lg font-semibold text-stone-900">
                  Supply Chain
                </h1>
                <p className="text-sm text-stone-500">
                  Sales & inventory intelligence
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="shrink-0 rounded-md p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {visibleLinks.map(({ href, label, icon: Icon, exact }) => {
          const active =
            pathname === href ||
            (!exact &&
              href !== "/dashboard" &&
              pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed
                  ? "justify-center px-2 py-2.5"
                  : "gap-3 px-3 py-2.5",
                active
                  ? "bg-emerald-700 text-white"
                  : "text-stone-700 hover:bg-stone-100",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
      {(displayName || email || role) && (
        <div className="border-t border-stone-200 p-2">
          {!collapsed && (
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-stone-800">
                {displayName || email || "Signed in"}
              </p>
              {role && (
                <p className="text-xs text-stone-500">{ROLE_LABELS[role]}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={signOut}
            title={collapsed ? "Sign out" : undefined}
            className={cn(
              "flex w-full items-center rounded-lg text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100",
              collapsed
                ? "justify-center px-2 py-2"
                : "mt-1 gap-3 px-3 py-2",
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      )}
    </aside>
  );
}
