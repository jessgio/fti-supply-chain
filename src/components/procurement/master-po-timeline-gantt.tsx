"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import type { PoTimelineEntry } from "@/types/database";

interface MasterPoTimelineGanttProps {
  purchaseOrders: PoTimelineEntry[];
}

function toMasterInput(po: PoTimelineEntry): MasterGanttPoInput {
  return {
    po_id: po.id,
    po_number: po.po_number,
    supplier_name: po.supplier_name ?? "Unknown",
    status: po.status,
    display_status: po.display_status,
    created_at: po.created_at,
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

export function MasterPoTimelineGantt({
  purchaseOrders,
}: MasterPoTimelineGanttProps) {
  const chart = buildMasterGanttChart(purchaseOrders.map(toMasterInput));
  const skippedCount =
    purchaseOrders.length - (chart?.groups.length ?? 0);

  if (!chart) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-stone-500">
          No timeline data yet. Ongoing POs need an expected finished date and/or
          linked shipments with departure and delivery dates.
        </CardContent>
      </Card>
    );
  }

  const todayPosition = getPoGanttPosition(
    chart.today,
    chart.rangeStart,
    chart.rangeEnd,
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Master timeline</CardTitle>
            <p className="mt-1 text-sm text-stone-500">
              {chart.groups.length} PO{chart.groups.length === 1 ? "" : "s"} with
              production and shipping schedules
              {skippedCount > 0
                ? ` · ${skippedCount} ongoing PO${skippedCount === 1 ? "" : "s"} hidden (missing dates)`
                : ""}
            </p>
          </div>
          <GanttLegend />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
              className="space-y-3 border-t border-stone-200 pt-5 first:border-t-0 first:pt-0"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/dashboard/procurement?po=${group.po_id}`}
                  className="font-semibold text-rose-700 hover:underline"
                >
                  {group.po_number}
                </Link>
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

              <div className="space-y-2">
                {group.bars.map((bar) => (
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
                        ? `/dashboard/shipments?highlight=${bar.id}`
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {todayPosition == null ? (
          <p className="text-xs text-stone-500">
            Today ({formatPoGanttDate(chart.today)}) falls outside this timeline
            range.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
