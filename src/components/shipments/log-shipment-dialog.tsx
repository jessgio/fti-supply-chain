"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ShipmentDocumentChecklist } from "@/components/shipments/shipment-document-checklist";
import {
  ShortShipWizardPanel,
  shortShipDialogDescription,
  shortShipDialogTitle,
  type ShortShipWizardStep,
} from "@/components/shipments/short-ship-wizard";
import { defaultRequiredDocuments } from "@/lib/shipments/document-types";
import {
  DEFAULT_TRANSIT_DAYS,
  type ShipmentType,
} from "@/lib/shipments/constants";
import { detectShortShipLines } from "@/lib/shipments/short-ship";
import { isIsoDate } from "@/lib/procurement/po-list-shipments";
import { formatNumber } from "@/lib/utils";
import type {
  PoShortfallResolution,
  PurchaseOrder,
  Shipment,
  ShipmentDocumentType,
  ShipmentLineAllocation,
} from "@/types/database";

interface LogShipmentDialogProps {
  open: boolean;
  po: PurchaseOrder;
  onClose: () => void;
  onCreated: (shipment: Shipment) => void;
  /** Prefill ETD. The PO page leaves this unset and starts from today. */
  initialDepartureDate?: string | null;
  departureHint?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PO-scoped shipment create form. Same fields, validation, and POST body as
 * the purchase order page's Log shipment dialog.
 */
export function LogShipmentDialog({
  open,
  po,
  onClose,
  onCreated,
  initialDepartureDate,
  departureHint,
}: LogShipmentDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shipmentType, setShipmentType] = useState<ShipmentType>("sea");
  const [departureDate, setDepartureDate] = useState(
    initialDepartureDate && isIsoDate(initialDepartureDate)
      ? initialDepartureDate
      : todayIso(),
  );
  const [transitDays, setTransitDays] = useState(DEFAULT_TRANSIT_DAYS.sea);
  const [shipmentNumber, setShipmentNumber] = useState("");
  const [allocations, setAllocations] = useState<ShipmentLineAllocation[]>([]);
  const [linesPoId, setLinesPoId] = useState<string | null>(null);
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [requiredDocuments, setRequiredDocuments] = useState<
    ShipmentDocumentType[]
  >(() => defaultRequiredDocuments("sea"));
  const [wizardStep, setWizardStep] = useState<ShortShipWizardStep>("form");
  const linesReady = linesPoId === po.id;

  function resetForNextOpen() {
    setWizardStep("form");
    setFormError(null);
    setRequiredDocuments(defaultRequiredDocuments(shipmentType));
    setLinesPoId(null);
    setAllocations([]);
  }

  function handleClose() {
    resetForNextOpen();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.append("po_id", po.id);
    fetch(`/api/shipments/allocations?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        const allocs = ((data.allocations ?? []) as ShipmentLineAllocation[]).filter(
          (a) => a.qty_available > 0,
        );
        setAllocations(allocs);
        const qtys: Record<string, number> = {};
        for (const a of allocs) qtys[a.po_line_id] = a.qty_available;
        setLineQtys(qtys);
        setLinesPoId(po.id);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAllocations([]);
        setLinesPoId(po.id);
      });
    return () => controller.abort();
  }, [open, po.id]);

  useEffect(() => {
    if (!open || !departureDate) return;
    const controller = new AbortController();
    const suggestParams = new URLSearchParams();
    suggestParams.append("po_id", po.id);
    suggestParams.set("shipment_type", shipmentType);
    suggestParams.set("departure_date", departureDate);
    fetch(`/api/shipments/suggest-number?${suggestParams.toString()}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.shipment_number) setShipmentNumber(data.shipment_number);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, po.id, shipmentType, departureDate]);

  const shortLines = detectShortShipLines(allocations, lineQtys);

  function itemsMissing() {
    const hasItems = allocations.some((a) => (lineQtys[a.po_line_id] ?? 0) > 0);
    if (!hasItems) {
      setFormError("Enter a ship quantity for at least one line.");
      return true;
    }
    setFormError(null);
    return false;
  }

  async function submitCreate(poResolution?: PoShortfallResolution) {
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
          delay_days: 0,
          notes: null,
          po_ids: [po.id],
          items,
          required_documents: requiredDocuments,
          ...(poResolution ? { po_resolution: poResolution } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create shipment");
      onCreated(data.shipment as Shipment);
      resetForNextOpen();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
      setWizardStep("form");
    } finally {
      setSaving(false);
    }
  }

  function handlePrimaryAction() {
    if (itemsMissing()) return;
    if (shortLines.length > 0) {
      setWizardStep("close_ship");
      return;
    }
    void submitCreate();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={shortShipDialogTitle(wizardStep) ?? "Log shipment"}
      description={
        shortShipDialogDescription(wizardStep) ??
        `Allocate line quantities from ${po.po_number} to this shipment.`
      }
      className="max-w-xl"
    >
      <div className="space-y-4">
        {wizardStep !== "form" ? (
          <ShortShipWizardPanel
            step={wizardStep}
            shortLines={shortLines}
            saving={saving}
            onLeaveOpen={() => void submitCreate()}
            onChooseClose={() => setWizardStep("po_resolution")}
            onResolve={(resolution) => void submitCreate(resolution)}
            onBack={() =>
              setWizardStep(wizardStep === "po_resolution" ? "close_ship" : "form")
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-stone-600">Type</span>
                <Select
                  value={shipmentType}
                  onChange={(e) => {
                    const next = e.target.value as ShipmentType;
                    setShipmentType(next);
                    setTransitDays(DEFAULT_TRANSIT_DAYS[next]);
                  }}
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
                {departureHint ? (
                  <span className="mt-1 block text-xs text-stone-500">
                    {departureHint}
                  </span>
                ) : null}
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

            {!linesReady ? (
              <p className="text-sm text-stone-500">Loading lines…</p>
            ) : allocations.length > 0 ? (
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

            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={handlePrimaryAction}
                disabled={saving || !linesReady || allocations.length === 0}
              >
                {saving
                  ? "Saving…"
                  : shortLines.length > 0
                    ? "Continue"
                    : "Create shipment"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
