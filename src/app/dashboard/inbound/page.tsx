"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import { ShipmentSelectInput } from "@/components/inbound/shipment-select-input";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  INBOUND_STATUS_LABELS,
  INBOUND_STATUS_STYLES,
  type InboundReceiveStatus,
} from "@/lib/shipments/constants";
import { formatNumber } from "@/lib/utils";
import type {
  InboundReceive,
  PoShortfallResolution,
  Shipment,
  ShipmentItemRef,
} from "@/types/database";

type LineBatchEntry = {
  id: string;
  batch_code: string;
  expiry_date: string;
  qty: number;
};

type WizardStep = "form" | "close_inbound" | "po_resolution";

function newBatchEntry(qty = 0): LineBatchEntry {
  return {
    id: crypto.randomUUID(),
    batch_code: "",
    expiry_date: "",
    qty,
  };
}

function shipmentLineRemaining(item: ShipmentItemRef): number {
  return Math.max(
    0,
    Number(item.quantity) - Number(item.qty_previously_received ?? 0),
  );
}

function listShipmentItems(shipment: Shipment | null): ShipmentItemRef[] {
  if (!shipment) return [];
  return (shipment.purchase_orders ?? []).flatMap((po) => po.items ?? []);
}

export default function InboundPage() {
  const [receives, setReceives] = useState<InboundReceive[]>([]);
  const [openShipments, setOpenShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("form");

  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [receiveDate, setReceiveDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [lineBatches, setLineBatches] = useState<Record<string, LineBatchEntry[]>>(
    {},
  );

  const loadReceives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/inbound?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load inbound receives");
      setReceives(data.receives ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

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

  const shipmentItems = useMemo(
    () => listShipmentItems(selectedShipment),
    [selectedShipment],
  );

  useEffect(() => {
    if (!selectedShipment) {
      setLineQtys({});
      setLineBatches({});
      return;
    }
    const qtys: Record<string, number> = {};
    for (const item of listShipmentItems(selectedShipment)) {
      qtys[item.po_line_id] = shipmentLineRemaining(item);
    }
    setLineQtys(qtys);
    setLineBatches({});
    setWizardStep("form");
  }, [selectedShipment]);

  function resetDialog() {
    setDialogOpen(false);
    setSelectedShipmentId("");
    setNotes("");
    setLineBatches({});
    setFormError(null);
    setWizardStep("form");
  }

  function updateLineQty(poLineId: string, qty: number) {
    setLineQtys((prev) => ({ ...prev, [poLineId]: qty }));
    if (qty <= 0) {
      setLineBatches((prev) => {
        const next = { ...prev };
        delete next[poLineId];
        return next;
      });
    }
  }

  function addLineBatch(poLineId: string) {
    const receivedQty = lineQtys[poLineId] ?? 0;
    const existing = lineBatches[poLineId] ?? [];
    const allocated = existing.reduce((sum, b) => sum + b.qty, 0);
    const remaining = Math.max(0, receivedQty - allocated);
    setLineBatches((prev) => ({
      ...prev,
      [poLineId]: [...existing, newBatchEntry(remaining)],
    }));
  }

  function updateLineBatch(
    poLineId: string,
    batchId: string,
    patch: Partial<Pick<LineBatchEntry, "batch_code" | "expiry_date" | "qty">>,
  ) {
    setLineBatches((prev) => ({
      ...prev,
      [poLineId]: (prev[poLineId] ?? []).map((batch) =>
        batch.id === batchId ? { ...batch, ...patch } : batch,
      ),
    }));
  }

  function removeLineBatch(poLineId: string, batchId: string) {
    setLineBatches((prev) => {
      const next = { ...prev };
      const filtered = (next[poLineId] ?? []).filter((b) => b.id !== batchId);
      if (filtered.length === 0) {
        delete next[poLineId];
      } else {
        next[poLineId] = filtered;
      }
      return next;
    });
  }

  function validateBatches(): string | null {
    for (const [poLineId, batches] of Object.entries(lineBatches)) {
      const receivedQty = lineQtys[poLineId] ?? 0;
      if (receivedQty <= 0) continue;
      const batchTotal = batches.reduce((sum, b) => sum + b.qty, 0);
      if (batchTotal !== receivedQty) {
        return "Each line's batch quantities must equal the received quantity.";
      }
      if (batches.some((b) => b.qty <= 0)) {
        return "Each batch must have a positive quantity.";
      }
    }
    return null;
  }

  const batchValidationError = useMemo(() => validateBatches(), [lineBatches, lineQtys]);

  const hasShortfall = useMemo(() => {
    return shipmentItems.some((item) => {
      const remaining = shipmentLineRemaining(item);
      if (remaining <= 0) return false;
      const received = lineQtys[item.po_line_id] ?? 0;
      return received < remaining;
    });
  }, [shipmentItems, lineQtys]);

  const shortfallLines = useMemo(() => {
    return shipmentItems
      .map((item) => {
        const expected = shipmentLineRemaining(item);
        const received = lineQtys[item.po_line_id] ?? 0;
        return {
          sku_code: item.sku_code,
          expected,
          received,
          shortBy: Math.max(0, expected - received),
        };
      })
      .filter((line) => line.shortBy > 0);
  }, [shipmentItems, lineQtys]);

  const summary = useMemo(() => ({
    total: receives.length,
    complete: receives.filter((r) => r.status === "complete").length,
    partial: receives.filter((r) => r.status === "partial").length,
    shortReceived: receives.filter((r) => r.status === "short_received").length,
  }), [receives]);

  async function handleDelete(receive: InboundReceive) {
    const label = receive.receive_number ?? "this receive";
    if (
      !confirm(
        `Delete ${label}? This reverses stock and PO received quantities. This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingId(receive.id);
    setError(null);
    try {
      const res = await fetch(`/api/inbound/${receive.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete inbound receive");
      setReceives((prev) => prev.filter((r) => r.id !== receive.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  function buildItems() {
    return shipmentItems
      .map((item) => {
        const batches = (lineBatches[item.po_line_id] ?? [])
          .filter((b) => b.qty > 0)
          .map((b) => ({
            batch_code: b.batch_code.trim() || null,
            expiry_date: b.expiry_date || null,
            qty: b.qty,
          }));
        return {
          po_line_id: item.po_line_id,
          sku_id: item.sku_id,
          ordered_qty: item.quantity,
          received_qty: lineQtys[item.po_line_id] ?? 0,
          ...(batches.length > 0 ? { batches } : {}),
        };
      })
      .filter((i) => i.received_qty > 0);
  }

  async function submitReceive(options: {
    close_shipment?: boolean;
    po_resolution?: PoShortfallResolution;
  }) {
    if (!selectedShipment) return;
    const batchError = validateBatches();
    if (batchError) {
      setFormError(batchError);
      setWizardStep("form");
      return;
    }

    const items = buildItems();
    if (items.length === 0) {
      setFormError("Enter a received quantity for at least one line.");
      setWizardStep("form");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch("/api/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_id: selectedShipmentId,
          receive_date: receiveDate,
          received_by: receivedBy || null,
          notes: notes || null,
          items,
          ...(options.close_shipment !== undefined
            ? { close_shipment: options.close_shipment }
            : {}),
          ...(options.po_resolution
            ? { po_resolution: options.po_resolution }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create receive");
      resetDialog();
      await loadReceives();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
      setWizardStep("form");
    } finally {
      setSaving(false);
    }
  }

  function handlePrimaryAction() {
    if (wizardStep !== "form") return;
    const batchError = validateBatches();
    if (batchError) {
      setFormError(batchError);
      return;
    }
    if (buildItems().length === 0) {
      setFormError("Enter a received quantity for at least one line.");
      return;
    }
    setFormError(null);
    if (hasShortfall) {
      setWizardStep("close_inbound");
      return;
    }
    void submitReceive({});
  }

  const dialogTitle =
    wizardStep === "close_inbound"
      ? "Received less than expected"
      : wizardStep === "po_resolution"
        ? "Resolve purchase order quantity"
        : "Log inbound receive";

  const dialogDescription =
    wizardStep === "close_inbound"
      ? "You can leave this inbound open for further receives, or close it now."
      : wizardStep === "po_resolution"
        ? "Choose how to handle the shortfall on the original purchase order."
        : "Select a shipment and confirm received quantities. Stock will be updated automatically.";

  return (
    <PageShell wide>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Inbound Receives</h1>
          <p className="mt-1 text-sm text-stone-500">
            Log when shipments arrive and record received SKUs and quantities.
          </p>
        </div>
        <Button
          onClick={() => {
            setWizardStep("form");
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Log receive
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Short received</CardDescription>
            <CardTitle className="text-2xl">{summary.shortReceived}</CardTitle>
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
                    <th className="py-2 pr-4 font-medium text-stone-500">Items</th>
                    <th className="py-2 font-medium text-stone-500">Actions</th>
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
                    const isDeleting = deletingId === receive.id;
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
                        <td className="py-3 pr-4 text-stone-600">
                          <div className="space-y-0.5">
                            {(receive.items ?? []).map((item) => (
                              <div key={item.id} className="text-xs">
                                {item.sku_code}: {formatNumber(item.received_qty)}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => void handleDelete(receive)}
                            disabled={isDeleting || deletingId !== null}
                            className="inline-flex items-center gap-1 text-red-700 hover:underline disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Delete
                          </button>
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
        onClose={resetDialog}
        title={dialogTitle}
        description={dialogDescription}
        className="max-w-3xl"
      >
        <div className="space-y-4">
          {wizardStep === "form" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Shipment
                </label>
                <ShipmentSelectInput
                  options={openShipments}
                  value={selectedShipmentId}
                  onChange={setSelectedShipmentId}
                />
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
              </div>

              {selectedShipment && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Received quantities
                  </label>
                  <p className="mb-2 text-xs text-stone-500">
                    You can receive less than the expected remaining quantity. Add
                    batch codes and expiry dates per line when stock arrives in
                    multiple lots.
                  </p>
                  <div className="overflow-x-auto rounded-md border border-stone-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 bg-stone-50 text-left">
                          <th className="px-3 py-2 font-medium text-stone-500">SKU</th>
                          <th className="px-3 py-2 font-medium text-stone-500">
                            Expected
                          </th>
                          <th className="px-3 py-2 font-medium text-stone-500">
                            Received
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {shipmentItems.map((item) => {
                          const remaining = shipmentLineRemaining(item);
                          const prior = Number(item.qty_previously_received ?? 0);
                          const receivedQty = lineQtys[item.po_line_id] ?? 0;
                          const batches = lineBatches[item.po_line_id] ?? [];
                          const batchTotal = batches.reduce((sum, b) => sum + b.qty, 0);
                          const batchMismatch =
                            batches.length > 0 && batchTotal !== receivedQty;
                          const underExpected =
                            remaining > 0 && receivedQty < remaining;

                          return (
                            <Fragment key={item.po_line_id}>
                              <tr className="border-b border-stone-100">
                                <td className="px-3 py-2">
                                  <span className="font-medium">{item.sku_code}</span>
                                  {item.sku_name && (
                                    <span className="ml-1 text-stone-500">
                                      {item.sku_name}
                                    </span>
                                  )}
                                  {prior > 0 && (
                                    <span className="mt-0.5 block text-xs text-stone-500">
                                      Already received {formatNumber(prior)} of{" "}
                                      {formatNumber(item.quantity)} shipped
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  {formatNumber(remaining)}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-col gap-0.5">
                                    <Input
                                      type="number"
                                      min={0}
                                      className="h-8 w-24"
                                      value={receivedQty}
                                      onChange={(e) =>
                                        updateLineQty(
                                          item.po_line_id,
                                          Number(e.target.value),
                                        )
                                      }
                                    />
                                    {receivedQty > remaining && (
                                      <span className="text-xs text-amber-700">
                                        +{formatNumber(receivedQty - remaining)} over
                                        expected
                                      </span>
                                    )}
                                    {underExpected && (
                                      <span className="text-xs text-amber-700">
                                        {formatNumber(remaining - receivedQty)} under
                                        expected
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {receivedQty > 0 && (
                                <tr className="border-b border-stone-100 bg-stone-50/60">
                                  <td colSpan={3} className="px-3 py-3">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-stone-600">
                                          Batch allocations
                                        </span>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => addLineBatch(item.po_line_id)}
                                        >
                                          <Plus className="mr-1 h-3 w-3" />
                                          Add batch
                                        </Button>
                                      </div>
                                      {batches.length === 0 ? (
                                        <p className="text-xs text-stone-500">
                                          Optional — add batches to track lot codes and
                                          expiry dates.
                                        </p>
                                      ) : (
                                        <div className="space-y-2">
                                          {batches.map((batch) => (
                                            <div
                                              key={batch.id}
                                              className="flex flex-wrap items-end gap-2"
                                            >
                                              <div className="min-w-[8rem] flex-1">
                                                <label className="mb-1 block text-xs text-stone-500">
                                                  Batch code
                                                </label>
                                                <Input
                                                  className="h-8"
                                                  placeholder="e.g. LOT-001"
                                                  value={batch.batch_code}
                                                  onChange={(e) =>
                                                    updateLineBatch(
                                                      item.po_line_id,
                                                      batch.id,
                                                      { batch_code: e.target.value },
                                                    )
                                                  }
                                                />
                                              </div>
                                              <div className="min-w-[9rem]">
                                                <label className="mb-1 block text-xs text-stone-500">
                                                  Expiry date
                                                </label>
                                                <Input
                                                  type="date"
                                                  className="h-8"
                                                  value={batch.expiry_date}
                                                  onChange={(e) =>
                                                    updateLineBatch(
                                                      item.po_line_id,
                                                      batch.id,
                                                      { expiry_date: e.target.value },
                                                    )
                                                  }
                                                />
                                              </div>
                                              <div className="w-24">
                                                <label className="mb-1 block text-xs text-stone-500">
                                                  Qty
                                                </label>
                                                <Input
                                                  type="number"
                                                  min={0}
                                                  max={receivedQty}
                                                  className="h-8"
                                                  value={batch.qty}
                                                  onChange={(e) =>
                                                    updateLineBatch(
                                                      item.po_line_id,
                                                      batch.id,
                                                      { qty: Number(e.target.value) },
                                                    )
                                                  }
                                                />
                                              </div>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 shrink-0 p-0 text-stone-500 hover:text-rose-600"
                                                onClick={() =>
                                                  removeLineBatch(
                                                    item.po_line_id,
                                                    batch.id,
                                                  )
                                                }
                                                aria-label="Remove batch"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          ))}
                                          {batchMismatch && (
                                            <p className="text-xs text-amber-700">
                                              Batch quantities ({formatNumber(batchTotal)})
                                              must equal received quantity (
                                              {formatNumber(receivedQty)}).
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}

          {wizardStep === "close_inbound" && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                <p className="font-medium">Quantities are under expected</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {shortfallLines.map((line) => (
                    <li key={line.sku_code}>
                      {line.sku_code}: received {formatNumber(line.received)} of{" "}
                      {formatNumber(line.expected)} expected (−
                      {formatNumber(line.shortBy)})
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm text-stone-600">
                Leave the inbound open if more stock from this shipment will arrive
                later. Closing it means you will not log further receives against this
                shipment.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void submitReceive({ close_shipment: false })}
                >
                  {saving ? "Saving…" : "Leave open for further inbound"}
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => setWizardStep("po_resolution")}
                >
                  Close this inbound
                </Button>
              </div>
            </div>
          )}

          {wizardStep === "po_resolution" && (
            <div className="space-y-4">
              <p className="text-sm text-stone-600">
                Closing this inbound short. Choose how to update the purchase order:
              </p>
              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void submitReceive({
                      close_shipment: true,
                      po_resolution: "leave_as_is",
                    })
                  }
                  className="rounded-lg border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-stone-900">
                    Leave PO quantity as-is
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Mark the PO and inbound as short received. Ordered quantities stay
                    the same; open remaining quantity is closed.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void submitReceive({
                      close_shipment: true,
                      po_resolution: "adjust_ordered",
                    })
                  }
                  className="rounded-lg border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-stone-900">
                    Change PO quantity to match received
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Update ordered quantities to what was actually received, then close
                    the order and remove it from the active procurement list when all
                    lines are complete.
                  </span>
                </button>
              </div>
            </div>
          )}

          {formError && <p className="text-sm text-rose-600">{formError}</p>}

          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            {wizardStep === "form" ? (
              <>
                <Button variant="outline" onClick={resetDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={handlePrimaryAction}
                  disabled={saving || !selectedShipmentId || !!batchValidationError}
                >
                  {saving ? "Saving…" : hasShortfall ? "Continue" : "Log receive"}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                disabled={saving}
                onClick={() =>
                  setWizardStep(
                    wizardStep === "po_resolution" ? "close_inbound" : "form",
                  )
                }
              >
                Back
              </Button>
            )}
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
