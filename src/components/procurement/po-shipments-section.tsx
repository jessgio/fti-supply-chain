"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileStack, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ShipmentHoverLink } from "@/components/procurement/shipment-hover-link";
import { StatusUpdateNotesLink } from "@/components/status-updates/status-update-notes-link";
import { poDetailHref } from "@/lib/shipments/shipment-navigation";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  DEFAULT_TRANSIT_DAYS,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_STYLES,
  type ShipmentStatus,
  type ShipmentType,
} from "@/lib/shipments/constants";
import { ShipmentDocumentsDialog } from "@/components/shipments/shipment-documents-dialog";
import { ShipmentDocumentChecklist } from "@/components/shipments/shipment-document-checklist";
import { defaultRequiredDocuments } from "@/lib/shipments/document-types";
import type {
  PurchaseOrder,
  Shipment,
  ShipmentDocumentType,
  ShipmentLineAllocation,
} from "@/types/database";
import { formatNumber } from "@/lib/utils";

export function PoShipmentsSection({
  po,
  onChanged,
}: {
  po: PurchaseOrder;
  onChanged: () => void;
}) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [allocations, setAllocations] = useState<ShipmentLineAllocation[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shipmentType, setShipmentType] = useState<ShipmentType>("sea");
  const [departureDate, setDepartureDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [transitDays, setTransitDays] = useState(DEFAULT_TRANSIT_DAYS.sea);
  const [delayDays, setDelayDays] = useState(0);
  const [shipmentNumber, setShipmentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [requiredDocuments, setRequiredDocuments] = useState<
    ShipmentDocumentType[]
  >(() => defaultRequiredDocuments("sea"));
  const [documentsShipment, setDocumentsShipment] = useState<Shipment | null>(
    null,
  );
  const [documentsOpen, setDocumentsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/shipments")
      .then((r) => r.json())
      .then((data) => {
        const all = (data.shipments ?? []) as Shipment[];
        setShipments(
          all
            .filter((s) =>
              (s.purchase_orders ?? []).some((p) => p.id === po.id),
            )
            .sort((a, b) =>
              b.estimated_departure_date.localeCompare(a.estimated_departure_date),
            ),
        );
      })
      .catch(() => setShipments([]));
  }, [po.id, po.updated_at]);

  useEffect(() => {
    if (!dialogOpen) return;
    const params = new URLSearchParams();
    params.append("po_id", po.id);
    fetch(`/api/shipments/allocations?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const allocs = (data.allocations ?? []).filter(
          (a: ShipmentLineAllocation) => a.qty_available > 0,
        );
        setAllocations(allocs);
        const qtys: Record<string, number> = {};
        for (const a of allocs) qtys[a.po_line_id] = a.qty_available;
        setLineQtys(qtys);
      })
      .catch(() => setAllocations([]));

    const suggestParams = new URLSearchParams();
    suggestParams.append("po_id", po.id);
    suggestParams.set("shipment_type", shipmentType);
    suggestParams.set("departure_date", departureDate);
    fetch(`/api/shipments/suggest-number?${suggestParams.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.shipment_number) setShipmentNumber(data.shipment_number);
      })
      .catch(() => {});
  }, [dialogOpen, po.id, shipmentType, departureDate]);

  useEffect(() => {
    setTransitDays(DEFAULT_TRANSIT_DAYS[shipmentType]);
  }, [shipmentType]);

  async function handleCreate() {
    setSaving(true);
    setFormError(null);
    try {
      const items = allocations
        .filter((a) => (lineQtys[a.po_line_id] ?? 0) > 0)
        .map((a) => ({
          po_line_id: a.po_line_id,
          quantity: lineQtys[a.po_line_id],
        }));

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_number: shipmentNumber,
          shipment_type: shipmentType,
          estimated_departure_date: departureDate,
          transit_days: transitDays,
          delay_days: delayDays,
          notes: notes || null,
          po_ids: [po.id],
          items,
          required_documents: requiredDocuments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create shipment");
      setDialogOpen(false);
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-stone-500" />
          <p className="text-sm font-medium text-stone-700">Shipments</p>
        </div>
        {po.status !== "received" && po.status !== "cancelled" && (
          <Button size="sm" variant="outline" onClick={() => {
            setRequiredDocuments(defaultRequiredDocuments(shipmentType));
            setDialogOpen(true);
          }}>
            <Plus className="h-3.5 w-3.5" />
            Log shipment
          </Button>
        )}
      </div>

      {shipments.length > 0 ? (
        <div className="space-y-2">
          {shipments.map((shipment) => (
            <div
              key={shipment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-sm"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <ShipmentHoverLink
                    shipmentId={shipment.id}
                    shipmentNumber={shipment.shipment_number}
                    returnTo={poDetailHref(po.id)}
                  />
                  <StatusUpdateNotesLink
                    entityType="shipment"
                    entityId={shipment.id}
                  />
                </div>
                <p className="text-xs text-stone-500">
                  Departs {formatDisplayDate(shipment.estimated_departure_date)} ·
                  ETA {formatDisplayDate(shipment.expected_delivery_date)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    SHIPMENT_STATUS_STYLES[shipment.status as ShipmentStatus]
                  }
                >
                  {SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus]}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setDocumentsShipment(shipment);
                    setDocumentsOpen(true);
                  }}
                >
                  <FileStack className="mr-1 h-3.5 w-3.5" />
                  Docs
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-500">No shipments logged for this PO yet.</p>
      )}

      <p className="text-xs text-stone-500">
        After goods depart, record inbound at{" "}
        <Link href="/dashboard/inbound" className="text-emerald-700 hover:underline">
          Inbound Receives
        </Link>
        .
      </p>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Log shipment"
        description={`Allocate line quantities from ${po.po_number} to this shipment.`}
        className="max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Type</span>
              <Select
                value={shipmentType}
                onChange={(e) => setShipmentType(e.target.value as ShipmentType)}
              >
                <option value="sea">Sea</option>
                <option value="air">Air</option>
                <option value="local">Local</option>
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Shipment number</span>
              <Input
                value={shipmentNumber}
                onChange={(e) => setShipmentNumber(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Departure date</span>
              <Input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Transit days</span>
              <Input
                type="number"
                min="0"
                value={transitDays}
                onChange={(e) => setTransitDays(Number(e.target.value))}
              />
            </label>
          </div>

          {allocations.length > 0 ? (
            <div className="overflow-x-auto rounded border border-stone-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Available</th>
                    <th className="px-3 py-2">Ship qty</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => (
                    <tr key={a.po_line_id} className="border-b border-stone-100">
                      <td className="px-3 py-2 font-medium">{a.sku_code}</td>
                      <td className="px-3 py-2">{formatNumber(a.qty_available)}</td>
                      <td className="px-3 py-2">
                        <Input
                          className="w-24"
                          type="number"
                          min="0"
                          max={a.qty_available}
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
          ) : (
            <p className="text-sm text-amber-800">
              All line quantities are already allocated to shipments.
            </p>
          )}

          <ShipmentDocumentChecklist
            shipmentType={shipmentType}
            selected={requiredDocuments}
            onChange={setRequiredDocuments}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || allocations.length === 0}
            >
              {saving ? "Saving…" : "Create shipment"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ShipmentDocumentsDialog
        shipment={documentsShipment}
        open={documentsOpen}
        onClose={() => {
          setDocumentsOpen(false);
          setDocumentsShipment(null);
        }}
      />
    </div>
  );
}
