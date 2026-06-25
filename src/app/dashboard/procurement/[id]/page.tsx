"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Pencil,
  Truck,
} from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PoPaymentsSection } from "@/components/procurement/po-payments-section";
import { PoShipmentsSection } from "@/components/procurement/po-shipments-section";
import {
  EditPoDialog,
  type PoSkuOption,
} from "@/components/procurement/edit-po-dialog";
import { SinglePoGantt } from "@/components/procurement/single-po-gantt";
import {
  DEFAULT_PO_CURRENCY,
  formatPoMoney,
} from "@/lib/procurement/currencies";
import {
  computePoInvoiceTotals,
  poLineOpenQty,
} from "@/lib/procurement/po-totals";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  nextStatus,
  downloadPoPdf,
} from "@/lib/procurement/po-status";
import { formatNumber, formatDate } from "@/lib/utils";
import type {
  PoStatus,
  PoTimelineEntry,
  PurchaseOrder,
  ShipmentLineAllocation,
  Supplier,
} from "@/types/database";

export default function PurchaseOrderPage() {
  const params = useParams();
  const poId = params.id as string;

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [timeline, setTimeline] = useState<PoTimelineEntry | null>(null);
  const [allocations, setAllocations] = useState<ShipmentLineAllocation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [skus, setSkus] = useState<PoSkuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const loadPo = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, timelineRes, allocRes] = await Promise.all([
        fetch(`/api/procurement/pos/${poId}`, { signal }),
        fetch(`/api/procurement/pos/${poId}/timeline`, { signal }),
        fetch(`/api/shipments/allocations?po_id=${poId}`, { signal }),
      ]);
      const poData = await poRes.json();
      const timelineData = await timelineRes.json();
      const allocData = await allocRes.json();

      if (!poRes.ok) throw new Error(poData.error ?? "Failed to load PO");
      setPo(poData.purchaseOrder);
      setTimeline(timelineData.entry ?? null);
      setAllocations(allocData.allocations ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPo(controller.signal);
    return () => controller.abort();
  }, [loadPo]);

  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [supRes, skuRes] = await Promise.all([
          fetch("/api/procurement/suppliers"),
          fetch("/api/procurement/skus"),
        ]);
        const supData = await supRes.json();
        const skuData = await skuRes.json();
        if (!active) return;
        setSuppliers(supData.suppliers ?? []);
        setSkus(skuData.skus ?? []);
      } catch {
        // metadata is optional for viewing
      }
    }
    void loadMeta();
    return () => {
      active = false;
    };
  }, []);

  const allocationByLine = useMemo(
    () => new Map(allocations.map((a) => [a.po_line_id, a])),
    [allocations],
  );

  const hasOpenShipments = useMemo(
    () =>
      (timeline?.shipments ?? []).length > 0 ||
      allocations.some((a) => a.qty_allocated > 0),
    [timeline?.shipments, allocations],
  );

  async function setStatus(status: PoStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/pos/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPo(data.purchaseOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageShell wide>
        <p className="text-sm text-stone-500">Loading purchase order…</p>
      </PageShell>
    );
  }

  if (!po) {
    return (
      <PageShell wide>
        <p className="text-sm text-red-600">{error ?? "Purchase order not found."}</p>
        <Link href="/dashboard/procurement" className="mt-4 text-sm text-emerald-700">
          Back to procurement
        </Link>
      </PageShell>
    );
  }

  const totals = computePoInvoiceTotals(po);
  const fmt = (value: number) => formatPoMoney(value, po.currency ?? DEFAULT_PO_CURRENCY);

  return (
    <PageShell wide>
      <div className="mb-6 space-y-4">
        <Link
          href="/dashboard/procurement"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          All purchase orders
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">{po.po_number}</h1>
            <p className="mt-1 text-sm text-stone-600">
              {po.supplier_name ?? "No supplier"} · {po.currency ?? DEFAULT_PO_CURRENCY}
              {po.expected_date ? ` · Expected ${formatDate(po.expected_date)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={STATUS_STYLES[po.status]}>{STATUS_LABELS[po.status]}</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                setPdfError(null);
                try {
                  await downloadPoPdf(po.id, po.po_number);
                } catch (err) {
                  setPdfError(err instanceof Error ? err.message : "PDF failed");
                }
              }}
              disabled={busy}
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={busy}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            {po.status !== "received" && po.status !== "cancelled" && nextStatus(po.status) && (
              <Button
                size="sm"
                onClick={() => setStatus(nextStatus(po.status)!)}
                disabled={busy}
              >
                <Truck className="h-3.5 w-3.5" />
                Mark {STATUS_LABELS[nextStatus(po.status)!]}
              </Button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {timeline && <SinglePoGantt entry={timeline} />}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4">SKU</th>
                    <th className="py-2 pr-4">Ordered</th>
                    <th className="py-2 pr-4">Shipped</th>
                    <th className="py-2 pr-4">Received</th>
                    <th className="py-2 pr-4">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.lines ?? []).map((line) => {
                    const alloc = allocationByLine.get(line.id);
                    const shipped = alloc?.qty_allocated ?? 0;
                    const open = poLineOpenQty(line);
                    return (
                      <tr key={line.id} className="border-b border-stone-100">
                        <td className="py-2 pr-4">
                          <span className="font-medium text-stone-900">{line.sku_code}</span>
                          {line.sku_name && (
                            <span className="block text-xs text-stone-500">
                              {line.sku_name}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{formatNumber(line.qty_ordered)}</td>
                        <td className="py-2 pr-4">{formatNumber(shipped)}</td>
                        <td className="py-2 pr-4">{formatNumber(line.qty_received)}</td>
                        <td className="py-2 pr-4 font-medium">{formatNumber(open)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasOpenShipments && (
                <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  This PO has open shipments — receive stock through{" "}
                  <Link href="/dashboard/inbound" className="font-medium underline">
                    Inbound Receives
                  </Link>{" "}
                  so shipment and PO status stay in sync.
                </p>
              )}
            </CardContent>
          </Card>

          <PoPaymentsSection
            po={po}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onUpdated={(updated) => {
              setPo(updated);
              void loadPo();
            }}
          />

          <PoShipmentsSection po={po} onChanged={loadPo} />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-600">Subtotal</span>
                <span className="font-medium">{fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-2 font-medium">
                <span>Invoice total</span>
                <span>{fmt(totals.invoiceTotal)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-stone-600">
              <p>1. Log down payment when sent to supplier.</p>
              <p>2. Advance status to Ordered when committed.</p>
              <p>3. Log shipment when goods depart.</p>
              <p>4. Record inbound when goods arrive.</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {editOpen && po && (
        <EditPoDialog
          po={po}
          suppliers={suppliers}
          skus={skus}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setPo(updated);
            setEditOpen(false);
            void loadPo();
          }}
          onSupplierCreated={(s) => setSuppliers((prev) => [...prev, s])}
        />
      )}
    </PageShell>
  );
}
