"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PackageCheck, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/dashboard/page-shell";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  INBOUND_STATUS_LABELS,
  INBOUND_STATUS_STYLES,
  type InboundReceiveStatus,
} from "@/lib/shipments/constants";
import { formatNumber } from "@/lib/utils";
import type { InboundReceive, Shipment } from "@/types/database";

export default function InboundPage() {
  const [receives, setReceives] = useState<InboundReceive[]>([]);
  const [openShipments, setOpenShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [receiveDate, setReceiveDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});

  const loadReceives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/inbound?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load inbound receives");
      setReceives(data.receives ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadReceives();
  }, [loadReceives]);

  useEffect(() => {
    if (!dialogOpen) return;
    fetch("/api/inbound?mode=open_shipments")
      .then((r) => r.json())
      .then((data) => setOpenShipments(data.shipments ?? []))
      .catch(() => setOpenShipments([]));
  }, [dialogOpen]);

  const selectedShipment = useMemo(
    () => openShipments.find((s) => s.id === selectedShipmentId) ?? null,
    [openShipments, selectedShipmentId],
  );

  useEffect(() => {
    if (!selectedShipment) {
      setLineQtys({});
      return;
    }
    const qtys: Record<string, number> = {};
    for (const po of selectedShipment.purchase_orders ?? []) {
      for (const item of po.items ?? []) {
        qtys[item.po_line_id] = item.quantity;
      }
    }
    setLineQtys(qtys);
  }, [selectedShipment]);

  const summary = useMemo(() => ({
    total: receives.length,
    complete: receives.filter((r) => r.status === "complete").length,
    partial: receives.filter((r) => r.status === "partial").length,
  }), [receives]);

  async function handleCreate() {
    if (!selectedShipment) return;
    setSaving(true);
    setFormError(null);

    const items = (selectedShipment.purchase_orders ?? []).flatMap((po) =>
      (po.items ?? []).map((item) => ({
        po_line_id: item.po_line_id,
        sku_id: item.sku_id,
        ordered_qty: item.quantity,
        received_qty: lineQtys[item.po_line_id] ?? 0,
      })),
    ).filter((i) => i.received_qty > 0);

    try {
      const res = await fetch("/api/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_id: selectedShipmentId,
          receive_date: receiveDate,
          received_by: receivedBy || null,
          notes: notes || null,
          batch_code: batchCode || null,
          expiry_date: expiryDate || null,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create receive");
      setDialogOpen(false);
      setSelectedShipmentId("");
      setNotes("");
      setBatchCode("");
      setExpiryDate("");
      await loadReceives();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell wide>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Inbound Receives</h1>
          <p className="mt-1 text-sm text-stone-500">
            Log when shipments arrive and record received SKUs and quantities.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Log receive
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total receives</CardDescription>
            <CardTitle className="text-2xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Complete</CardDescription>
            <CardTitle className="text-2xl">{summary.complete}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Partial</CardDescription>
            <CardTitle className="text-2xl">{summary.partial}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              className="pl-9"
              placeholder="Search receive, PO, shipment…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-600">{error}</p>
          ) : receives.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              No inbound receives yet. Log a receive when a shipment arrives.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left">
                    <th className="py-2 pr-4 font-medium text-stone-500">Receive #</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Shipment</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">PO</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Date</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Qty received</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Status</th>
                    <th className="py-2 font-medium text-stone-500">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {receives.map((receive) => {
                    const totalReceived = (receive.items ?? []).reduce(
                      (s, i) => s + i.received_qty,
                      0,
                    );
                    const totalOrdered = (receive.items ?? []).reduce(
                      (s, i) => s + i.ordered_qty,
                      0,
                    );
                    return (
                      <tr
                        key={receive.id}
                        className="border-b border-stone-100 hover:bg-stone-50/50"
                      >
                        <td className="py-3 pr-4 font-medium text-stone-900">
                          {receive.receive_number ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {receive.shipment_number ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {receive.po_number ?? "—"}
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-stone-600">
                          {formatDisplayDate(receive.receive_date)}
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-stone-600">
                          {formatNumber(totalReceived)} / {formatNumber(totalOrdered)}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            className={
                              INBOUND_STATUS_STYLES[receive.status as InboundReceiveStatus]
                            }
                          >
                            {INBOUND_STATUS_LABELS[receive.status as InboundReceiveStatus]}
                          </Badge>
                        </td>
                        <td className="py-3 text-stone-600">
                          <div className="space-y-0.5">
                            {(receive.items ?? []).map((item) => (
                              <div key={item.id} className="text-xs">
                                {item.sku_code}: {formatNumber(item.received_qty)}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Log inbound receive"
        description="Select a shipment and confirm received quantities. Stock will be updated automatically."
        className="max-w-2xl"
      >
        <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                Shipment
              </label>
              <select
                className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
                value={selectedShipmentId}
                onChange={(e) => setSelectedShipmentId(e.target.value)}
              >
                <option value="">Select a shipment…</option>
                {openShipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shipment_number} — delivery{" "}
                    {formatDisplayDate(s.expected_delivery_date)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Receive date
                </label>
                <Input
                  type="date"
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Received by
                </label>
                <Input
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Batch code (optional)
                </label>
                <Input
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Expiry date (optional)
                </label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            {selectedShipment && (
              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Received quantities
                </label>
                <div className="overflow-x-auto rounded-md border border-stone-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-left">
                        <th className="px-3 py-2 font-medium text-stone-500">SKU</th>
                        <th className="px-3 py-2 font-medium text-stone-500">Shipped</th>
                        <th className="px-3 py-2 font-medium text-stone-500">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedShipment.purchase_orders ?? []).flatMap((po) =>
                        (po.items ?? []).map((item) => (
                          <tr key={item.po_line_id} className="border-b border-stone-100">
                            <td className="px-3 py-2">
                              <span className="font-medium">{item.sku_code}</span>
                              {item.sku_name && (
                                <span className="ml-1 text-stone-500">{item.sku_name}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatNumber(item.quantity)}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={0}
                                max={item.quantity}
                                className="h-8 w-24"
                                value={lineQtys[item.po_line_id] ?? 0}
                                onChange={(e) =>
                                  setLineQtys((prev) => ({
                                    ...prev,
                                    [item.po_line_id]: Number(e.target.value),
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

          {formError && <p className="text-sm text-rose-600">{formError}</p>}

          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !selectedShipmentId}
            >
              {saving ? "Saving…" : "Log receive"}
            </Button>
          </div>
        </div>
      </Dialog>

      <p className="mt-4 text-xs text-stone-500">
        Received stock appears in{" "}
        <Link href="/dashboard/batches" className="text-emerald-700 hover:underline">
          Stock Batches
        </Link>
        . Create shipments in{" "}
        <Link href="/dashboard/shipments" className="text-emerald-700 hover:underline">
          Shipments
        </Link>{" "}
        before logging a receive.
      </p>
    </PageShell>
  );
}
