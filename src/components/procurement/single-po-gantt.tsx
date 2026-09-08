"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
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
  getPoGanttPosition,
} from "@/lib/procurement/po-timeline-gantt";
import { GanttAxis, GanttLegend, GanttRow } from "@/components/procurement/gantt-chart-parts";
import {
  poDetailHref,
  shipmentDetailHref,
} from "@/lib/shipments/shipment-navigation";
import {
  DEFAULT_PO_CURRENCY,
  formatPoMoney,
} from "@/lib/procurement/currencies";
import {
  billableLineQty,
  computePoInvoiceTotals,
} from "@/lib/procurement/po-totals";
import {
  resolveProductLineLabel,
  showSkuCodeSubline,
} from "@/lib/procurement/product-line-label";
import { formatNumber } from "@/lib/utils";
import type { PoTimelineEntry, PurchaseOrder } from "@/types/database";

interface SinglePoGanttProps {
  entry: PoTimelineEntry;
  /** When provided, shows a collapsible qty / unit cost / line total table. */
  po?: Pick<
    PurchaseOrder,
    | "lines"
    | "currency"
    | "status"
    | "discount_amount"
    | "tax_pct"
    | "pph_pct"
    | "other_charges"
    | "down_payment_pct"
  >;
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

type PoPricingSource = NonNullable<SinglePoGanttProps["po"]>;

function PoLinePricingDetails({ po }: { po: PoPricingSource }) {
  const lines = po.lines ?? [];
  if (lines.length === 0) return null;

  const currency = po.currency ?? DEFAULT_PO_CURRENCY;
  const totals = computePoInvoiceTotals(po);

  return (
    <details className="group rounded-lg border border-stone-200 bg-stone-50/80 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-stone-800 [&::-webkit-details-marker]:hidden">
        <span>
          Line pricing
          <span className="ml-2 font-normal text-stone-500">
            {formatNumber(totals.totalQty, 2)} qty ·{" "}
            {formatPoMoney(totals.subtotal, currency)}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-stone-200 px-3 pb-3 pt-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium">Unit cost</th>
                <th className="py-2 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const qty = billableLineQty(line, po);
                const unitCost = line.unit_cost;
                const lineTotal = (unitCost ?? 0) * qty;
                const label = resolveProductLineLabel(line);
                const showSku = showSkuCodeSubline(line);
                return (
                  <tr
                    key={line.id}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="py-2 pr-3 align-top">
                      <span className="font-medium text-stone-900">
                        {label}
                      </span>
                      {showSku ? (
                        <span className="mt-0.5 block font-mono text-xs text-stone-500">
                          {line.sku_code}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums text-stone-800">
                      {formatNumber(qty, 2)}
                    </td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums text-stone-800">
                      {unitCost != null
                        ? formatPoMoney(unitCost, currency)
                        : "—"}
                    </td>
                    <td className="py-2 text-right align-top tabular-nums font-medium text-stone-900">
                      {formatPoMoney(lineTotal, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200">
                <td className="pt-2 pr-3 font-medium text-stone-900">Total</td>
                <td className="pt-2 pr-3 text-right tabular-nums font-medium text-stone-900">
                  {formatNumber(totals.totalQty, 2)}
                </td>
                <td className="pt-2 pr-3" />
                <td className="pt-2 text-right tabular-nums font-medium text-stone-900">
                  {formatPoMoney(totals.subtotal, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </details>
  );
}

export function SinglePoGantt({ entry, po }: SinglePoGanttProps) {
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

  const pricing = po ? <PoLinePricingDetails po={po} /> : null;

  if (!chart) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PO timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-stone-500">
          <p>
            Set an expected delivery date or log a shipment to see the schedule.
          </p>
          {pricing}
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
        {pricing}
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
