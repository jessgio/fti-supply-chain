"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PO_TIMELINE_STATUS_LABELS,
  PO_TIMELINE_STATUS_STYLES,
} from "@/lib/shipments/constants";
import {
  buildMasterGanttChart,
  formatPoGanttDate,
  getPoGanttPosition,
  type MasterGanttPoInput,
} from "@/lib/procurement/po-timeline-gantt";
import { GanttAxis, GanttLegend, GanttRow } from "@/components/procurement/gantt-chart-parts";
import {
  poDetailHref,
  shipmentDetailHref,
} from "@/lib/shipments/shipment-navigation";
import { PoTimelinePoLink } from "@/components/procurement/po-timeline-po-link";
import { PoTimelineProducts } from "@/components/procurement/po-timeline-products";
import { PoTimelineNotesSidebar } from "@/components/procurement/po-timeline-notes-sidebar";
import { useStatusUpdateCounts } from "@/lib/hooks/use-status-update-counts";
import type { PoTimelineEntry, Profile, UserRole } from "@/types/database";

interface MasterPoTimelineGanttProps {
  purchaseOrders: PoTimelineEntry[];
  currentUserId?: string | null;
  currentUserRole?: UserRole | null;
}

function toMasterInput(po: PoTimelineEntry): MasterGanttPoInput {
  return {
    po_id: po.id,
    po_number: po.po_number,
    supplier_name: po.supplier_name ?? "Unknown",
    status: po.status,
    display_status: po.display_status,
    created_at: po.created_at,
    order_date: po.order_date,
    expected_date: po.expected_date,
    payments: po.payments,
    shipments: po.shipments.map((s) => ({
      id: s.id,
      shipment_number: s.shipment_number,
      estimated_departure_date: s.estimated_departure_date,
      expected_delivery_date: s.expected_delivery_date,
      delay_days: s.delay_days,
    })),
  };
}

function statusBadgeClass(status: string): string {
  return PO_TIMELINE_STATUS_STYLES[status] ?? "bg-stone-100 text-stone-700";
}

function formatStatusLabel(status: string): string {
  return (
    PO_TIMELINE_STATUS_LABELS[status] ??
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function poTimelineEntryMatchesSearch(
  po: PoTimelineEntry,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (po.po_number.toLowerCase().includes(q)) return true;
  if ((po.supplier_name ?? "").toLowerCase().includes(q)) return true;

  const lineMatches = (line: { sku_code: string; sku_name: string | null }) =>
    line.sku_code.toLowerCase().includes(q) ||
    (line.sku_name ?? "").toLowerCase().includes(q);

  if (po.line_items.some(lineMatches)) return true;
  if (po.shipments.some((shipment) => shipment.line_items.some(lineMatches))) {
    return true;
  }

  return false;
}

export function MasterPoTimelineGantt({
  purchaseOrders,
  currentUserId = null,
  currentUserRole = null,
}: MasterPoTimelineGanttProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const searchQ = searchQuery.trim().toLowerCase();

  const filteredPurchaseOrders = useMemo(() => {
    if (!searchQ) return purchaseOrders;
    return purchaseOrders.filter((po) =>
      poTimelineEntryMatchesSearch(po, searchQ),
    );
  }, [purchaseOrders, searchQ]);

  const poIds = useMemo(
    () => filteredPurchaseOrders.map((po) => po.id),
    [filteredPurchaseOrders],
  );
  const poNoteCounts = useStatusUpdateCounts("po", poIds);

  useEffect(() => {
    let active = true;
    async function loadProfiles() {
      try {
        const res = await fetch("/api/product-development/profiles");
        const data = await res.json();
        if (!active || !res.ok) return;
        setProfiles(data.profiles ?? []);
      } catch {
        if (active) setProfiles([]);
      }
    }
    void loadProfiles();
    return () => {
      active = false;
    };
  }, []);

  const chart = useMemo(
    () => buildMasterGanttChart(filteredPurchaseOrders.map(toMasterInput)),
    [filteredPurchaseOrders],
  );
  const scheduledCount =
    chart?.groups.filter((group) => group.bars.length > 0).length ?? 0;
  const unscheduledCount = filteredPurchaseOrders.length - scheduledCount;
  const poById = useMemo(
    () => new Map(filteredPurchaseOrders.map((po) => [po.id, po])),
    [filteredPurchaseOrders],
  );

  if (purchaseOrders.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-stone-500">
          No ongoing purchase orders to show. POs marked received or cancelled
          are excluded from this view.
        </CardContent>
      </Card>
    );
  }

  const todayPosition = chart
    ? getPoGanttPosition(chart.today, chart.rangeStart, chart.rangeEnd)
    : null;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Master timeline</CardTitle>
            <p className="mt-1 text-sm text-stone-500">
              {searchQ
                ? `${filteredPurchaseOrders.length} ongoing PO${
                    filteredPurchaseOrders.length === 1 ? "" : "s"
                  } match “${searchQuery.trim()}”`
                : `${purchaseOrders.length} ongoing PO${
                    purchaseOrders.length === 1 ? "" : "s"
                  }`}
              {chart && scheduledCount > 0
                ? ` · ${scheduledCount} with production or shipping schedules`
                : ""}
              {chart && unscheduledCount > 0
                ? ` · ${unscheduledCount} awaiting dates`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-8 pr-8"
                placeholder="Find POs by number, supplier, SKU, or name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <GanttLegend />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!chart ? (
          <p className="py-8 text-center text-sm text-stone-500">
            No purchase orders match “{searchQuery.trim()}”.
          </p>
        ) : (
          <>
        <GanttAxis
          ticks={chart.ticks}
          rangeStart={chart.rangeStart}
          rangeEnd={chart.rangeEnd}
          today={chart.today}
          labelWidth="10rem"
          dateWidth="11rem"
          todayPosition={todayPosition}
        />

        <div className="space-y-6">
          {chart.groups.map((group) => (
            <section
              key={group.po_id}
              className="flex items-start gap-3 border-t border-stone-200 pt-5 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <PoTimelinePoLink
                    poId={group.po_id}
                    poNumber={group.po_number}
                    lineItems={poById.get(group.po_id)?.line_items ?? []}
                  />
                  <span
                    className="min-w-0 truncate text-sm uppercase text-stone-500"
                    title={group.supplier_name}
                  >
                    {group.supplier_name}
                  </span>
                  <Badge
                    className={`shrink-0 uppercase ${statusBadgeClass(group.display_status)}`}
                  >
                    {formatStatusLabel(group.display_status)}
                  </Badge>
                </div>

                <PoTimelineProducts
                  products={poById.get(group.po_id)?.line_items ?? []}
                />

                <div className="space-y-2">
                  {group.bars.length === 0 ? (
                    <p className="rounded-md border border-dashed border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                      No schedule bars yet. Set an expected finish date on the PO,
                      log a down payment, or create a shipment with departure and
                      delivery dates.
                    </p>
                  ) : (
                    group.bars.map((bar) => (
                      <GanttRow
                        key={`${group.po_id}-${bar.phase}-${bar.id}`}
                        bar={bar}
                        rangeStart={chart.rangeStart}
                        rangeEnd={chart.rangeEnd}
                        todayPosition={todayPosition}
                        labelWidth="10rem"
                        dateWidth="11rem"
                        shipmentHref={
                          bar.phase === "shipping"
                            ? shipmentDetailHref(bar.id, poDetailHref(group.po_id))
                            : undefined
                        }
                      />
                    ))
                  )}
                </div>
              </div>

              <PoTimelineNotesSidebar
                poId={group.po_id}
                poNumber={group.po_number}
                noteCount={poNoteCounts.get(group.po_id)?.count ?? 0}
                profiles={profiles}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
              />
            </section>
          ))}
        </div>

        {todayPosition == null ? (
          <p className="text-xs text-stone-500">
            Today ({formatPoGanttDate(chart.today)}) falls outside this timeline
            range.
          </p>
        ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
