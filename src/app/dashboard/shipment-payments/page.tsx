"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Search, Truck } from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShipmentHoverLink } from "@/components/procurement/shipment-hover-link";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import {
  formatLarkApprovalStatus,
  larkApprovalStatusBadgeClass,
} from "@/lib/lark/ap-form";
import { shipmentPaymentParts } from "@/lib/lark/shipment-ap";
import { formatPoMoney } from "@/lib/procurement/currencies";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_STYLES,
  type ShipmentStatus,
} from "@/lib/shipments/constants";
import type { ShipmentPaymentListRow } from "@/lib/db/shipment-lark";
import type { ShipmentLarkSubmission } from "@/types/database";

function statusBadge(sub: ShipmentLarkSubmission | null) {
  if (!sub) {
    return <span className="text-stone-400">Not requested</span>;
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${larkApprovalStatusBadgeClass(sub.lark_approval_status)}`}
      >
        {formatLarkApprovalStatus(sub.lark_approval_status)}
      </span>
      {sub.submitted_amount != null ? (
        <span className="text-[11px] text-stone-600">
          {formatPoMoney(sub.submitted_amount, sub.submitted_currency ?? "IDR")}
        </span>
      ) : null}
    </span>
  );
}

export default function ShipmentPaymentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ShipmentPaymentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shipment-payments");
      const data = (await res.json()) as {
        error?: string;
        rows?: ShipmentPaymentListRow[];
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load shipments");
      setRows(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const { poNumbers, productNames } = shipmentPaymentParts(row.shipment);
      const haystack = [
        row.shipment.shipment_number,
        ...poNumbers,
        ...productNames,
        ...(row.shipment.purchase_orders ?? []).map((po) => po.supplier_name ?? ""),
        row.tax?.lark_serial_number ?? "",
        row.shipping?.lark_serial_number ?? "",
        row.shipping?.supplier_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, debouncedSearch]);

  const summary = useMemo(() => {
    const tax = rows.filter((r) => r.tax).length;
    const shipping = rows.filter((r) => r.shipping).length;
    const both = rows.filter((r) => r.tax && r.shipping).length;
    return { total: rows.length, tax, shipping, both };
  }, [rows]);

  return (
    <PageShell wide>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-stone-900">
            <FileText className="h-6 w-6 text-stone-500" />
            Shipment payments
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Submit Lark AP Forms for tax invoices and shipping invoices against
            existing shipments. Each shipment can have both.
          </p>
        </div>
        <Link
          href="/dashboard/shipments"
          className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          <Truck className="mr-1.5 h-4 w-4" />
          Shipments
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shipments</CardDescription>
            <CardTitle className="text-2xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tax invoices requested</CardDescription>
            <CardTitle className="text-2xl">{summary.tax}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shipping invoices requested</CardDescription>
            <CardTitle className="text-2xl">{summary.shipping}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Both requested</CardDescription>
            <CardTitle className="text-2xl">{summary.both}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle>Match a shipment</CardTitle>
              <CardDescription>
                Search existing shipments, then open one to request a tax invoice
                and/or shipping invoice.
              </CardDescription>
            </div>
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-9"
                placeholder="Shipment, PO, product, supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              {rows.length === 0
                ? "No shipments yet. Create one under Shipments first."
                : "No shipments match your search."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4">Shipment</th>
                    <th className="py-2 pr-4">POs / products</th>
                    <th className="py-2 pr-4">Schedule</th>
                    <th className="py-2 pr-4">Tax invoice</th>
                    <th className="py-2 pr-4">Shipping invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const { poNumbers, productNames, qty } = shipmentPaymentParts(
                      row.shipment,
                    );
                    return (
                      <tr
                        key={row.shipment.id}
                        className="cursor-pointer border-b border-stone-100 hover:bg-stone-50/70"
                        onClick={() =>
                          router.push(
                            `/dashboard/shipment-payments/${row.shipment.id}`,
                          )
                        }
                      >
                        <td className="py-3 pr-4">
                          <span
                            className="inline-flex flex-col gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ShipmentHoverLink
                              shipmentId={row.shipment.id}
                              shipmentNumber={row.shipment.shipment_number}
                            />
                            <Badge
                              className={
                                SHIPMENT_STATUS_STYLES[
                                  row.shipment.status as ShipmentStatus
                                ]
                              }
                            >
                              {
                                SHIPMENT_STATUS_LABELS[
                                  row.shipment.status as ShipmentStatus
                                ]
                              }
                            </Badge>
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {(row.shipment.purchase_orders ?? []).map((po) => (
                              <span
                                key={po.id}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <PoHoverLink
                                  poId={po.id}
                                  poNumber={po.po_number}
                                />
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-stone-500">
                            {productNames.join(", ") || poNumbers.join(", ") || "—"}
                            {qty > 0 ? ` · qty ${qty.toLocaleString("en-US")}` : ""}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatDisplayDate(
                            row.shipment.estimated_departure_date,
                          )}{" "}
                          →{" "}
                          {formatDisplayDate(row.shipment.expected_delivery_date)}
                        </td>
                        <td className="py-3 pr-4">{statusBadge(row.tax)}</td>
                        <td className="py-3 pr-4">{statusBadge(row.shipping)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
