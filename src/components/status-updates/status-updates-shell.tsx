"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText, PenLine } from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/status-updates", label: "All updates", exact: true },
  { href: "/dashboard/status-updates/new", label: "New update", exact: false },
] as const;

interface StatusUpdatesShellProps {
  children: React.ReactNode;
}

export function StatusUpdatesShell({ children }: StatusUpdatesShellProps) {
  const pathname = usePathname();

  return (
    <PageShell wide>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <MessageSquareText className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">
              Status Updates
            </h1>
            <p className="text-sm text-stone-600">
              Product status notes grouped by purchase order — line items
              listed once per PO with notes below.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-stone-200">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-stone-500 hover:text-stone-800",
              )}
            >
              {tab.href.endsWith("/new") ? (
                <PenLine className="h-4 w-4" />
              ) : (
                <MessageSquareText className="h-4 w-4" />
              )}
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </PageShell>
  );
}
