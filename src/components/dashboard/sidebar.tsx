"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Beaker,
  Boxes,
  ChevronDown,
  GanttChart,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeft,
  PanelLeftClose,
  ShoppingCart,
  Truck,
  Upload,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { readUnclassifiedCountCache, writeUnclassifiedCountCache } from "@/lib/skus/unclassified-count-cache";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import type { UserRole } from "@/types/database";

interface NavLink {
  href: string;
  label: string;
  icon?: typeof LayoutDashboard;
  roles?: UserRole[];
  /** When true, only highlight on exact path match (not sub-routes). */
  exact?: boolean;
  /** Also highlight on these sections, including sibling routes that do not share href. */
  activePrefixes?: string[];
}

interface NavItem extends NavLink {
  icon: typeof LayoutDashboard;
  children?: NavLink[];
}

const SUPPLY_CHAIN: UserRole[] = ["admin", "supply_chain"];

const links: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  {
    href: "/dashboard/sales",
    label: "Sales",
    icon: BarChart3,
    children: [
      { href: "/dashboard/commercial", label: "Commercial" },
      {
        href: "/dashboard/sales-forecast",
        label: "Forecast",
        activePrefixes: ["/dashboard/sales-forecast", "/dashboard/sales-accuracy"],
      },
    ],
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    icon: Package,
    children: [
      {
        href: "/dashboard/batches",
        label: "Stock batches",
        roles: SUPPLY_CHAIN,
      },
      { href: "/dashboard/insights", label: "Insights" },
    ],
  },
  {
    href: "/dashboard/procurement",
    label: "Procurement",
    icon: ShoppingCart,
    roles: SUPPLY_CHAIN,
    children: [
      {
        href: "/dashboard/po-timeline",
        label: "Timeline",
        icon: GanttChart,
        roles: ["admin", "supply_chain", "viewer"],
        activePrefixes: ["/dashboard/po-timeline", "/dashboard/timeline-adjustment"],
      },
      {
        href: "/dashboard/payments",
        label: "Payments",
        roles: SUPPLY_CHAIN,
        activePrefixes: ["/dashboard/payments", "/dashboard/shipment-payments"],
      },
      {
        href: "/dashboard/status-updates",
        label: "Status updates",
        roles: SUPPLY_CHAIN,
      },
    ],
  },
  {
    href: "/dashboard/shipments",
    label: "Shipments",
    icon: Truck,
    roles: SUPPLY_CHAIN,
    children: [
      {
        href: "/dashboard/inbound",
        label: "Inbound receives",
        roles: SUPPLY_CHAIN,
      },
      {
        href: "/dashboard/extract-inbound-delivery-notes",
        label: "Delivery notes",
        roles: SUPPLY_CHAIN,
        activePrefixes: [
          "/dashboard/extract-inbound-delivery-notes",
          "/dashboard/primary-packaging-delivery-notes",
          "/dashboard/delivery-notes",
        ],
      },
    ],
  },
  {
    href: "/dashboard/mappings",
    label: "Products",
    icon: Boxes,
    children: [
      {
        href: "/dashboard/bundles",
        label: "Bundles",
        roles: SUPPLY_CHAIN,
      },
      {
        href: "/dashboard/packaging",
        label: "Packaging",
        roles: SUPPLY_CHAIN,
      },
      {
        href: "/dashboard/extracts",
        label: "Extracts",
        roles: SUPPLY_CHAIN,
      },
    ],
  },
  {
    href: "/dashboard/product-development/projects",
    label: "Product development",
    icon: Beaker,
    roles: SUPPLY_CHAIN,
    activePrefixes: ["/dashboard/product-development"],
    children: [
      {
        href: "/dashboard/product-development/formula-tracker",
        label: "Formula tracker",
        roles: SUPPLY_CHAIN,
      },
    ],
  },
  {
    href: "/dashboard/uploads",
    label: "Data uploads",
    icon: Upload,
    roles: SUPPLY_CHAIN,
  },
  {
    href: "/dashboard/lark-users",
    label: "Lark users",
    icon: Users,
    roles: ["admin"],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  supply_chain: "Supply Chain",
  sales_marketing: "Sales & Marketing",
  viewer: "Viewer",
};

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isHrefActive(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  if (pathname === href) return true;
  if (exact || href === "/dashboard") return false;
  return pathname.startsWith(`${href}/`);
}

function isLinkActive(
  pathname: string,
  href: string,
  exact?: boolean,
  activePrefixes?: string[],
): boolean {
  if (activePrefixes?.some((prefix) => matchesPrefix(pathname, prefix))) {
    return true;
  }
  if (pathname === href) return true;
  if (exact || href === "/dashboard") return false;
  return pathname.startsWith(`${href}/`);
}

function isChildActive(
  pathname: string,
  children: NavLink[] | undefined,
): boolean {
  return (
    children?.some((child) =>
      isLinkActive(pathname, child.href, child.exact, child.activePrefixes),
    ) ?? false
  );
}

function roleCanSee(
  roles: UserRole[] | undefined,
  role: UserRole | null | undefined,
): boolean {
  return !roles || !role || roles.includes(role);
}

function filterNavItems(
  items: NavItem[],
  role: UserRole | null | undefined,
): NavItem[] {
  const result: NavItem[] = [];

  for (const item of items) {
    const visibleChildren = item.children?.filter((child) =>
      roleCanSee(child.roles, role),
    );
    const parentVisible = roleCanSee(item.roles, role);
    if (!parentVisible && (!visibleChildren || visibleChildren.length === 0)) {
      continue;
    }

    let href = item.href;
    let label = item.label;
    let exact = item.exact;
    let activePrefixes = item.activePrefixes;
    let icon = item.icon;
    let children = visibleChildren;

    // A viewer who can open the timeline must not land on procurement itself.
    if (!parentVisible && children && children.length > 0) {
      const [first, ...rest] = children;
      href = first.href;
      label = first.label;
      exact = first.exact;
      activePrefixes = first.activePrefixes;
      icon = first.icon ?? item.icon;
      children = rest;
    }

    if (children && children.length > 0) {
      children = children.filter((child) => child.href !== href);
    }

    result.push({
      ...item,
      href,
      label,
      exact,
      activePrefixes,
      icon,
      children: children && children.length > 0 ? children : undefined,
    });
  }

  return result;
}

interface SidebarProps {
  role?: UserRole | null;
  displayName?: string | null;
  email?: string | null;
  userId?: string | null;
}

export function Sidebar({ role, displayName, email, userId }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed } = useSidebar();
  const cachedUnclassifiedCount = readUnclassifiedCountCache();
  const [fetchedUnclassifiedCount, setFetchedUnclassifiedCount] = useState<
    number | null
  >(null);
  const unclassifiedCount = cachedUnclassifiedCount ?? fetchedUnclassifiedCount ?? 0;
  const [pin, setPin] = useState<{ path: string; href: string | null } | null>(
    null,
  );

  const visibleLinks = filterNavItems(links, role);
  const activeGroupHref =
    visibleLinks.find(
      (item) =>
        isLinkActive(pathname, item.href, item.exact, item.activePrefixes) ||
        isChildActive(pathname, item.children),
    )?.href ?? null;
  const expandedHref = pin?.path === pathname ? pin.href : activeGroupHref;

  function toggleGroup(href: string) {
    setPin({ path: pathname, href: expandedHref === href ? null : href });
  }

  useEffect(() => {
    if (readUnclassifiedCountCache() != null) return;
    let cancelled = false;
    fetch("/api/skus?scope=unclassified&count_only=1")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const count = typeof data.count === "number" ? data.count : 0;
        writeUnclassifiedCountCache(count);
        setFetchedUnclassifiedCount(count);
      })
      .catch(() => {
        if (!cancelled) setFetchedUnclassifiedCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <NotificationBell userId={userId} collapsed={collapsed} />
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
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {visibleLinks.map((item) => {
          const { href, label, icon: Icon, exact, activePrefixes, children } =
            item;
          const selfActive = isLinkActive(pathname, href, exact, activePrefixes);
          const childActive = isChildActive(pathname, children);
          const active = selfActive || childActive;
          const open =
            !collapsed && expandedHref === href && Boolean(children?.length);
          const showUnclassifiedBadge =
            href === "/dashboard/mappings" && unclassifiedCount > 0;

          return (
            <div key={href} className="flex flex-col gap-0.5">
              <div
                className={cn(
                  "flex items-stretch rounded-lg transition-colors",
                  active
                    ? "bg-emerald-700 text-white"
                    : "text-stone-700 hover:bg-stone-100",
                )}
              >
                <Link
                  href={href}
                  title={
                    collapsed
                      ? showUnclassifiedBadge
                        ? `${label} (${unclassifiedCount} unclassified)`
                        : label
                      : undefined
                  }
                  aria-current={
                    isHrefActive(pathname, href, exact) ? "page" : undefined
                  }
                  className={cn(
                    "flex min-w-0 flex-1 items-center text-sm font-medium",
                    collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon className="h-4 w-4" />
                    {collapsed && showUnclassifiedBadge && (
                      <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </span>
                  {!collapsed && <span className="truncate">{label}</span>}
                  {!collapsed && showUnclassifiedBadge && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                        active
                          ? "bg-amber-200 text-amber-950"
                          : "bg-amber-100 text-amber-900",
                      )}
                      title={`${unclassifiedCount} SKU${unclassifiedCount === 1 ? "" : "s"} need classification`}
                    >
                      {unclassifiedCount > 99 ? "99+" : unclassifiedCount}
                    </span>
                  )}
                </Link>
                {!collapsed && children && children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(href)}
                    aria-expanded={open}
                    aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
                    className={cn(
                      "shrink-0 rounded-r-lg px-2",
                      active
                        ? "text-emerald-100 hover:bg-emerald-800 hover:text-white"
                        : "text-stone-500 hover:bg-stone-200 hover:text-stone-800",
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>
              {open &&
                children?.map((child) => {
                  const childIsActive = isLinkActive(
                    pathname,
                    child.href,
                    child.exact,
                    child.activePrefixes,
                  );
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      aria-current={
                        isHrefActive(pathname, child.href, child.exact)
                          ? "page"
                          : undefined
                      }
                      className={cn(
                        "block truncate rounded-lg py-2 pl-9 pr-3 text-sm transition-colors",
                        childIsActive
                          ? "bg-emerald-100 font-medium text-emerald-900"
                          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
            </div>
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
