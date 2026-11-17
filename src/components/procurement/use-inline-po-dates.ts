"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  applySavedPurchaseOrderDates,
  clonePoListShipments,
  restorePurchaseOrderExpectedDate,
  shiftPurchaseOrdersForExpectedDate,
  todayIsoDate,
} from "@/lib/procurement/po-expected-date-shipments";
import {
  isIsoDate,
  patchDesiredWindow,
  patchShipmentWindow,
  toPoListShipment,
  withShipmentSummary,
  type ShipmentDateField,
} from "@/lib/procurement/po-list-shipments";
import type { PoListShipment, PurchaseOrder, Shipment } from "@/types/database";

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Optimistic date saves for the procurement list. A newer pick for the same
 * field waits for the in-flight request, then saves. A failure rolls the
 * field back to the last value the server accepted. An expected-date edit
 * also moves open shipment dates, and those roll back with it.
 */
export function useInlinePoDates(
  setPos: Dispatch<SetStateAction<PurchaseOrder[]>>,
) {
  const [pendingDateKeys, setPendingDateKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [dateErrors, setDateErrors] = useState<Record<string, string>>({});
  const running = useRef(new Set<string>());
  const expectedBaseline = useRef(
    new Map<
      string,
      { expectedDate: string | null; shipments: PoListShipment[] }
    >(),
  );
  const expectedDesired = useRef(new Map<string, string | null>());
  const shipmentBaseline = useRef(new Map<string, PoListShipment>());
  const shipmentDesired = useRef(
    new Map<string, { start?: string; end?: string; field: ShipmentDateField }>(),
  );

  function clearError(key: string) {
    setDateErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setPending(key: string, on: boolean) {
    setPendingDateKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function syncPoStatuses(poIds: readonly string[]) {
    await Promise.all(
      poIds.map(async (poId) => {
        try {
          const res = await fetch(`/api/procurement/pos/${poId}`);
          if (!res.ok) return;
          const data = await readJson(res);
          const updated = data.purchaseOrder as PurchaseOrder | undefined;
          if (!updated) return;
          setPos((prev) =>
            prev.map((po) =>
              po.id === poId ? { ...po, status: updated.status } : po,
            ),
          );
        } catch {
          // Dates are already saved. Status catches up on the next list load.
        }
      }),
    );
  }

  async function saveExpectedDate(po: PurchaseOrder, date: string | null) {
    const key = `${po.id}:expected`;
    if (date !== null && !isIsoDate(date)) {
      setDateErrors((prev) => ({ ...prev, [key]: "Choose a valid date." }));
      return;
    }
    if (po.status === "cancelled") {
      setDateErrors((prev) => ({
        ...prev,
        [key]: `Couldn't save the expected date for ${po.po_number}. Cancelled purchase orders can only have notes updated.`,
      }));
      return;
    }
    if (date === po.expected_date && !running.current.has(key)) return;

    if (!running.current.has(key)) {
      expectedBaseline.current.set(key, {
        expectedDate: po.expected_date ?? null,
        shipments: clonePoListShipments(po.shipments),
      });
    }
    expectedDesired.current.set(key, date);
    clearError(key);
    const today = todayIsoDate();
    setPos((prev) =>
      shiftPurchaseOrdersForExpectedDate(prev, po.id, date, today),
    );
    if (running.current.has(key)) return;

    running.current.add(key);
    setPending(key, true);
    try {
      while (expectedDesired.current.has(key)) {
        const nextDate = expectedDesired.current.get(key) ?? null;
        expectedDesired.current.delete(key);
        try {
          const res = await fetch(`/api/procurement/pos/${po.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expected_date: nextDate }),
          });
          const data = await readJson(res);
          if (!res.ok || !data.purchaseOrder) {
            throw new Error(
              typeof data.error === "string"
                ? data.error
                : "Failed to update expected date.",
            );
          }
          const saved = data.purchaseOrder as PurchaseOrder;
          const previous = expectedBaseline.current.get(key);
          expectedBaseline.current.set(key, {
            expectedDate: saved.expected_date ?? null,
            shipments: saved.shipments
              ? clonePoListShipments(saved.shipments)
              : previous?.shipments ?? [],
          });
          if (!expectedDesired.current.has(key)) {
            setPos((prev) => applySavedPurchaseOrderDates(prev, saved));
            const otherPoIds = new Set<string>();
            for (const shipment of saved.shipments ?? []) {
              for (const link of shipment.linked_purchase_orders ?? []) {
                if (link.id !== po.id) otherPoIds.add(link.id);
              }
            }
            if (otherPoIds.size > 0) void syncPoStatuses([...otherPoIds]);
          }
        } catch (error) {
          if (expectedDesired.current.has(key)) continue;
          const baseline = expectedBaseline.current.get(key);
          setPos((prev) =>
            restorePurchaseOrderExpectedDate(
              prev,
              po.id,
              baseline?.expectedDate ?? null,
              baseline?.shipments ?? [],
            ),
          );
          setDateErrors((prev) => ({
            ...prev,
            [key]: `Couldn't save the expected date for ${po.po_number}. ${errorText(error, "Failed to update expected date.")}`,
          }));
        }
      }
    } finally {
      running.current.delete(key);
      setPending(key, false);
    }
  }

  async function saveShipmentDate(
    po: PurchaseOrder,
    shipment: PoListShipment,
    field: ShipmentDateField,
    date: string,
  ) {
    const key = shipment.id;
    const errorKey = `${shipment.id}:${field}`;
    const current =
      field === "start"
        ? shipment.estimated_departure_date
        : shipment.expected_delivery_date;
    if (date === current && !running.current.has(key)) return;

    const label = field === "start" ? "ship start" : "ship end";
    const patch = patchShipmentWindow(shipment, field, date);
    if ("error" in patch) {
      setDateErrors((prev) => ({
        ...prev,
        [errorKey]: `Couldn't save the ${label} date for ${po.po_number} (${shipment.shipment_number}). ${patch.error}`,
      }));
      return;
    }

    if (!running.current.has(key)) {
      shipmentBaseline.current.set(key, shipment);
    }
    const previous = shipmentDesired.current.get(key) ?? {};
    shipmentDesired.current.set(key, { ...previous, [field]: date, field });
    clearError(errorKey);
    setPos((prev) => withShipmentSummary(prev, patch.next, []));
    if (running.current.has(key)) return;

    running.current.add(key);
    setPending(`${key}:start`, true);
    setPending(`${key}:end`, true);
    try {
      while (shipmentDesired.current.has(key)) {
        const desired = shipmentDesired.current.get(key);
        shipmentDesired.current.delete(key);
        if (!desired) break;
        const baseline = shipmentBaseline.current.get(key) ?? shipment;
        const nextPatch = patchDesiredWindow(baseline, desired);
        const failedField = desired.field;
        const failedKey = `${shipment.id}:${failedField}`;
        const failedLabel = failedField === "start" ? "ship start" : "ship end";
        if ("error" in nextPatch) {
          if (shipmentDesired.current.has(key)) continue;
          setPos((prev) => withShipmentSummary(prev, baseline, []));
          setDateErrors((prev) => ({
            ...prev,
            [failedKey]: `Couldn't save the ${failedLabel} date for ${po.po_number} (${shipment.shipment_number}). ${nextPatch.error}`,
          }));
          continue;
        }
        if (Object.keys(nextPatch.body).length === 0) {
          setPos((prev) => withShipmentSummary(prev, baseline, []));
          continue;
        }
        try {
          const res = await fetch(`/api/shipments/${shipment.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nextPatch.body),
          });
          const data = await readJson(res);
          if (!res.ok || !data.shipment) {
            throw new Error(
              typeof data.error === "string"
                ? data.error
                : "Failed to update shipment.",
            );
          }
          const saved = data.shipment as Shipment;
          const summary = toPoListShipment(saved);
          shipmentBaseline.current.set(key, summary);
          const linkedIds = (saved.purchase_orders ?? []).map((row) => row.id);
          if (!shipmentDesired.current.has(key)) {
            setPos((prev) => withShipmentSummary(prev, summary, linkedIds));
            const statusIds = linkedIds.includes(po.id)
              ? linkedIds
              : [...linkedIds, po.id];
            void syncPoStatuses(statusIds);
          }
        } catch (error) {
          if (shipmentDesired.current.has(key)) continue;
          setPos((prev) => withShipmentSummary(prev, baseline, []));
          setDateErrors((prev) => ({
            ...prev,
            [failedKey]: `Couldn't save the ${failedLabel} date for ${po.po_number} (${shipment.shipment_number}). ${errorText(error, "Failed to update shipment.")}`,
          }));
        }
      }
    } finally {
      running.current.delete(key);
      setPending(`${key}:start`, false);
      setPending(`${key}:end`, false);
    }
  }

  function attachShipment(shipment: Shipment, fallbackPoId: string) {
    const summary = toPoListShipment(shipment);
    const linkedIds = (shipment.purchase_orders ?? []).map((row) => row.id);
    const ids = linkedIds.length > 0 ? linkedIds : [fallbackPoId];
    setPos((prev) => withShipmentSummary(prev, summary, ids));
    void syncPoStatuses(ids);
  }

  return {
    pendingDateKeys,
    dateErrors,
    saveExpectedDate,
    saveShipmentDate,
    attachShipment,
  };
}
