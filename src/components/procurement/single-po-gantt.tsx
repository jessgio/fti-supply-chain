"use client";

import { useMemo } from "react";
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
  buildPoGanttBars,
  formatPoGanttDate,
  getPoGanttPosition,
} from "@/lib/procurement/po-timeline-gantt";
import { GanttAxis, GanttLegend, GanttRow } from "@/components/procurement/gantt-chart-parts";
import {
  poDetailHref,
  shipmentDetailHref,
} from "@/lib/shipments/shipment-navigation";
import type { PoTimelineEntry } from "@/types/database";

interface SinglePoGanttProps {
  entry: PoTimelineEntry;
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

export function SinglePoGantt({ entry }: SinglePoGanttProps) {
  const chart = useMemo(() => {
    const bars = buildPoGanttBars(
      {
        created_at: entry.created_at,
        order_date: entry.order_date,
        expected_date: entry.expected_date,
        payments: entry.payments,
        shipments: entry.shipments.map((s) => ({
          id: s.id,
          shipment_number: s.shipment_number,
          estimated_departure_date: s.estimated_departure_date,
          expected_delivery_date: s.expected_delivery_date,
          delay_days: s.delay_days,
        })),
      },
      entry.id,
    );

    if (bars.length === 0) return null;

    const datePoints = bars.flatMap((bar) => [bar.start, bar.end]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    datePoints.push(today);

    let rangeStart = new Date(Math.min(...datePoints.map((d) => d.getTime())));
    let rangeEnd = new Date(Math.max(...datePoints.map((d) => d.getTime())));
    const rangeMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), 86400000);
    const padMs = Math.max(rangeMs * 0.06, 2 * 86400000);
    rangeStart = new Date(rangeStart.getTime() - padMs);
    rangeEnd = new Date(rangeEnd.getTime() + padMs);

    const tickCount = 5;
    const span = rangeEnd.getTime() - rangeStart.getTime();
    const ticks: Date[] = [];
    for (let i = 0; i <= tickCount; i += 1) {
      ticks.push(new Date(rangeStart.getTime() + (span * i) / tickCount));
    }

    return { bars, rangeStart, rangeEnd, today, ticks };
  }, [entry]);

  if (!chart) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PO timeline</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-stone-500">
          Set an expected delivery date or log a shipment to see the schedule.
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
            <CardTitle className="text-base">PO timeline</CardTitle>
            <p className="mt-1 text-sm text-stone-500">
              Production and shipping schedule for this order.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusBadgeClass(entry.display_status)}>
              {formatStatusLabel(entry.display_status)}
            </Badge>
            <GanttLegend />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <GanttAxis
          ticks={chart.ticks}
          rangeStart={chart.rangeStart}
          rangeEnd={chart.rangeEnd}
          today={chart.today}
          labelWidth="0"
          dateWidth="11rem"
          todayPosition={todayPosition}
        />
        <div className="space-y-2">
          {chart.bars.length === 0 ? (
            <p className="rounded-md border border-dashed border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
              No schedule bars yet.
            </p>
          ) : (
            chart.bars.map((bar) => (
              <GanttRow
                key={`${entry.id}-${bar.phase}-${bar.id}`}
                bar={bar}
                rangeStart={chart.rangeStart}
                rangeEnd={chart.rangeEnd}
                todayPosition={todayPosition}
                labelWidth="10rem"
                dateWidth="11rem"
                shipmentHref={
                  bar.phase === "shipping"
                    ? shipmentDetailHref(bar.id, poDetailHref(entry.id))
                    : undefined
                }
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
