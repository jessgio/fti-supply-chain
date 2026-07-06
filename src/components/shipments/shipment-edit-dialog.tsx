"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ShipmentDocumentChecklist } from "@/components/shipments/shipment-document-checklist";
import { ShipmentDocumentsPanel } from "@/components/shipments/shipment-documents-panel";
import {
  DEFAULT_TRANSIT_DAYS,
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
  type ShipmentType,
} from "@/lib/shipments/constants";
import { resolveShipmentStatusFromDeparture } from "@/lib/shipments/shipment-dates";
import { formatNumber } from "@/lib/utils";
import type {
  PurchaseOrder,
  Shipment,
  ShipmentDocumentType,
  ShipmentLineAllocation,
} from "@/types/database";

type EditTab = "details" | "documents";

interface ShipmentEditDialogProps {
  shipmentId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function ShipmentEditDialog({
  shipmentId,
  open,
  onClose,
  onSaved,
}: ShipmentEditDialogProps) {
  const [tab, setTab] = useState<EditTab>("details");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [openPos, setOpenPos] = useState<PurchaseOrder[]>([]);

  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<ShipmentLineAllocation[]>([]);
  const [shipmentType, setShipmentType] = useState<ShipmentType>("sea");
  const [status, setStatus] = useState<ShipmentStatus>("planned");
  const [departureDate, setDepartureDate] = useState("");
  const [transitDays, setTransitDays] = useState(DEFAULT_TRANSIT_DAYS.sea);
  const [delayDays, setDelayDays] = useState(0);
  const [shipmentNumber, setShipmentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [requiredDocuments, setRequiredDocuments] = useState<
    ShipmentDocumentType[]
  >([]);

  const loadShipment = useCallback(async () => {
    if (!shipmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load shipment");

      const s = data.shipment as Shipment;
      setShipment(s);
      setShipmentType(s.shipment_type);
      setStatus(s.status);
      setDepartureDate(s.estimated_departure_date);
      setTransitDays(s.transit_days);
      setDelayDays(s.delay_days);
      setShipmentNumber(s.shipment_number);
      setNotes(s.notes ?? "");
      setRequiredDocuments(s.required_documents ?? []);
      const poIds = (s.purchase_orders ?? []).map((po) => po.id);
      setSelectedPoIds(poIds);

      const qtys: Record<string, number> = {};
      for (const po of s.purchase_orders ?? []) {
        for (const item of po.items ?? []) {
          qtys[item.po_line_id] = item.quantity;
        }
      }
      setLineQtys(qtys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    if (!open || !shipmentId) return;
    setTab("details");
    void loadShipment();
  }, [open, shipmentId, loadShipment]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/procurement/pos")
      .then((r) => r.json())
      .then((data) => {
        const pos = (data.purchaseOrders ?? []).filter(
          (po: PurchaseOrder) =>
            po.status !== "received" && po.status !== "cancelled",
        );
        setOpenPos(pos);
      })
      .catch(() => setOpenPos([]));
  }, [open]);

  useEffect(() => {
    setStatus((current) =>
      resolveShipmentStatusFromDeparture(current, departureDate),
    );
  }, [departureDate]);

  useEffect(() => {
    if (!selectedPoIds.length || !shipmentId) {
      setAllocations([]);
      return;
    }
    const params = new URLSearchParams();
    selectedPoIds.forEach((id) => params.append("po_id", id));
    params.set("exclude_shipment_id", shipmentId);
    fetch(`/api/shipments/allocations?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setAllocations(data.allocations ?? []);
      })
      .catch(() => setAllocations([]));
  }, [selectedPoIds, shipmentId]);

  const visibleAllocations = useMemo(
    () =>
      allocations.filter(
        (a) => a.qty_available > 0 || (lineQtys[a.po_line_id] ?? 0) > 0,
      ),
    [allocations, lineQtys],
  );

  const selectablePos = useMemo(() => {
    const linkedFromShipment = (shipment?.purchase_orders ?? []).filter(
      (po) => !openPos.some((p) => p.id === po.id),
    );
    const extra: PurchaseOrder[] = linkedFromShipment.map((po) => ({
      id: po.id,
      po_number: po.po_number,
      supplier_name: po.supplier_name,
      status: "ordered",
    })) as PurchaseOrder[];
    return [...openPos, ...extra.filter((po) => !openPos.some((p) => p.id === po.id))];
  }, [openPos, shipment]);

  function toggleSelectedPo(poId: string) {
    setSelectedPoIds((prev) =>
      prev.includes(poId) ? prev.filter((id) => id !== poId) : [...prev, poId],
    );
  }

  async function handleSave() {
    if (!shipmentId) return;
    setSaving(true);
    setError(null);
    try {
      const items = visibleAllocations
        .filter((a) => (lineQtys[a.po_line_id] ?? 0) > 0)
        .map((a) => ({
          po_line_id: a.po_line_id,
          quantity: lineQtys[a.po_line_id],
        }));

      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_number: shipmentNumber,
          shipment_type: shipmentType,
          status,
          estimated_departure_date: departureDate,
          transit_days: transitDays,
          delay_days: delayDays,
          notes: notes || null,
          po_ids: selectedPoIds,
          items,
          required_documents: requiredDocuments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update shipment");

      setShipment(data.shipment);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={shipment ? `Edit shipment · ${shipment.shipment_number}` : "Edit shipment"}
      description="Update shipment details, allocations, and documents."
      className="max-w-3xl"
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
      ) : !shipment ? (
        <p className="py-8 text-center text-sm text-rose-600">
          {error ?? "Shipment not found."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
            <button
              type="button"
              onClick={() => setTab("details")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "details"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setTab("documents")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "documents"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Documents
            </button>
          </div>

          {tab === "details" ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Purchase orders
                </label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-stone-200 p-2">
                  {selectablePos.length === 0 ? (
                    <p className="text-sm text-stone-500">No open POs available.</p>
                  ) : (
                    selectablePos.map((po) => (
                      <label
                        key={po.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-stone-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPoIds.includes(po.id)}
                          onChange={() => toggleSelectedPo(po.id)}
                        />
                        <span className="text-sm">
                          <span className="font-medium text-rose-700">{po.po_number}</span>
                          {po.supplier_name && (
                            <span className="ml-2 text-stone-500">{po.supplier_name}</span>
                          )}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Shipment type
                  </label>
                  <Select
                    value={shipmentType}
                    onChange={(e) => setShipmentType(e.target.value as ShipmentType)}
                  >
                    <option value="sea">Sea</option>
                    <option value="air">Air</option>
                    <option value="local">Local</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Status
                  </label>
                  <Select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ShipmentStatus)}
                  >
                    {Object.entries(SHIPMENT_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Shipment number
                  </label>
                  <Input
                    value={shipmentNumber}
                    onChange={(e) => setShipmentNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Estimated departure
                  </label>
                  <Input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Transit days
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={transitDays}
                    onChange={(e) => setTransitDays(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Delay days
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={delayDays}
                    onChange={(e) => setDelayDays(Number(e.target.value))}
                  />
                </div>
              </div>

              {visibleAllocations.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Line allocations
                  </label>
                  <div className="overflow-x-auto rounded-md border border-stone-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 bg-stone-50 text-left">
                          <th className="px-3 py-2 font-medium text-stone-500">PO</th>
                          <th className="px-3 py-2 font-medium text-stone-500">SKU</th>
                          <th className="px-3 py-2 font-medium text-stone-500">Available</th>
                          <th className="px-3 py-2 font-medium text-stone-500">Ship qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAllocations.map((a) => (
                          <tr key={a.po_line_id} className="border-b border-stone-100">
                            <td className="px-3 py-2">{a.po_number}</td>
                            <td className="px-3 py-2">{a.sku_code}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatNumber(a.qty_available)}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={0}
                                max={a.qty_available}
                                className="h-8 w-24"
                                value={lineQtys[a.po_line_id] ?? 0}
                                onChange={(e) =>
                                  setLineQtys((prev) => ({
                                    ...prev,
                                    [a.po_line_id]: Number(e.target.value),
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <ShipmentDocumentChecklist
                shipmentType={shipmentType}
                selected={requiredDocuments}
                onChange={setRequiredDocuments}
                resetOnTypeChange={false}
              />
            </div>
          ) : (
            <ShipmentDocumentsPanel shipment={shipment} />
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <Button variant="outline" onClick={onClose}>
              {tab === "documents" ? "Close" : "Cancel"}
            </Button>
            {tab === "details" && (
              <Button
                onClick={handleSave}
                disabled={
                  saving || !selectedPoIds.length || !visibleAllocations.length
                }
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
