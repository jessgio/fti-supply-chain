import {
  addIsoDays,
  daysBetweenIso,
  isIsoDate,
  mergePurchaseOrderUpdate,
} from "@/lib/procurement/po-list-shipments";
import type {
  PoListLinkedPurchaseOrder,
  PoListShipment,
  PoStatus,
  PurchaseOrder,
  ShipmentStatus,
} from "@/types/database";

/**
 * Shipping starts after production finishes. When a purchase order's expected
 * date moves, open linked shipments move by the same number of days so the
 * gap between production and departure stays put.
 *
 * Shipment statuses are planned, in_transit, delivered, and closed. A
 * shipment is left alone when it is closed, departed (in_transit, or still
 * planned but the departure is today or earlier), or received (delivered).
 * There is no cancelled shipment status. A cancelled purchase order cannot
 * change its expected date. On a shared shipment, cancelled and received
 * purchase orders are not production constraints.
 *
 * A shipment linked to more than one purchase order shifts only when this
 * order's new expected date is on or after every other linked order that is
 * still open and has an expected date. Ties shift. An earlier order does not
 * pull a shared ship away from a later open order. Clearing the expected date
 * does not move shipments. When the previous expected date was empty, an
 * eligible shipment's departure becomes the new expected date, which is how
 * the log-shipment form prefills ETD.
 */

export type ExpectedDateShiftSkipReason =
  | "expected_date_cleared"
  | "closed"
  | "departed"
  | "received"
  | "not_latest_po";

export interface ExpectedDateShiftSkip {
  id: string;
  reason: ExpectedDateShiftSkipReason;
}

export interface PlannedShipmentShift {
  shipment: PoListShipment;
  fromDeparture: string;
  fromStatus: ShipmentStatus;
}

export interface ExpectedDateShipmentPlan {
  shifts: PlannedShipmentShift[];
  skipped: ExpectedDateShiftSkip[];
}

export interface ShipmentExpectedDateInput {
  shipment: PoListShipment;
  linkedPurchaseOrders: readonly PoListLinkedPurchaseOrder[];
}

const FINISHED_PO_STATUSES = new Set<PoStatus>(["received", "cancelled"]);

/** Local calendar day, matching shipment departure checks elsewhere. */
export function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function readIsoDate(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const date = value.slice(0, 10);
  return isIsoDate(date) ? date : null;
}

export function clonePoListShipments(
  shipments: readonly PoListShipment[] | undefined,
): PoListShipment[] {
  return (shipments ?? []).map((shipment) => ({
    ...shipment,
    linked_purchase_orders: shipment.linked_purchase_orders?.map((link) => ({
      ...link,
    })),
  }));
}

function shipmentFollowSkip(
  shipment: PoListShipment,
  today: string,
): ExpectedDateShiftSkipReason | null {
  if (shipment.status === "closed") return "closed";
  if (shipment.status === "delivered") return "received";
  if (shipment.status === "in_transit") return "departed";
  if (shipment.estimated_departure_date <= today) return "departed";
  return null;
}

function otherOpenExpectedDates(
  links: readonly PoListLinkedPurchaseOrder[],
  poId: string,
): string[] {
  const dates: string[] = [];
  for (const link of links) {
    if (link.id === poId) continue;
    if (FINISHED_PO_STATUSES.has(link.status)) continue;
    const expected = readIsoDate(link.expected_date);
    if (expected) dates.push(expected);
  }
  return dates;
}

function isLatestExpectedDate(nextExpectedDate: string, others: readonly string[]): boolean {
  return others.every((expected) => nextExpectedDate >= expected);
}

function nextShipmentDates(
  shipment: PoListShipment,
  previousExpectedDate: string | null,
  nextExpectedDate: string,
  today: string,
): PoListShipment {
  const departure = previousExpectedDate
    ? addIsoDays(
        shipment.estimated_departure_date,
        daysBetweenIso(previousExpectedDate, nextExpectedDate),
      )
    : nextExpectedDate;
  const status: ShipmentStatus = departure <= today ? "in_transit" : "planned";
  return {
    ...shipment,
    status,
    estimated_departure_date: departure,
    expected_delivery_date: addIsoDays(
      departure,
      shipment.transit_days + shipment.delay_days,
    ),
  };
}

export function planExpectedDateShipmentShifts(input: {
  poId: string;
  previousExpectedDate: string | null;
  nextExpectedDate: string | null;
  shipments: readonly ShipmentExpectedDateInput[];
  today: string;
}): ExpectedDateShipmentPlan {
  const previous = readIsoDate(input.previousExpectedDate);
  const next =
    input.nextExpectedDate == null || input.nextExpectedDate === ""
      ? null
      : readIsoDate(input.nextExpectedDate);
  if ((input.nextExpectedDate ?? "") !== "" && !next) {
    throw new Error("Choose a valid date.");
  }
  if (!isIsoDate(input.today)) {
    throw new Error("Choose a valid date.");
  }

  if (previous === next) {
    return { shifts: [], skipped: [] };
  }

  if (!next) {
    return {
      shifts: [],
      skipped: input.shipments.map((row) => ({
        id: row.shipment.id,
        reason: "expected_date_cleared",
      })),
    };
  }

  const shifts: PlannedShipmentShift[] = [];
  const skipped: ExpectedDateShiftSkip[] = [];
  for (const row of input.shipments) {
    const blocked = shipmentFollowSkip(row.shipment, input.today);
    if (blocked) {
      skipped.push({ id: row.shipment.id, reason: blocked });
      continue;
    }
    const others = otherOpenExpectedDates(row.linkedPurchaseOrders, input.poId);
    if (!isLatestExpectedDate(next, others)) {
      skipped.push({ id: row.shipment.id, reason: "not_latest_po" });
      continue;
    }
    shifts.push({
      fromDeparture: row.shipment.estimated_departure_date,
      fromStatus: row.shipment.status,
      shipment: nextShipmentDates(row.shipment, previous, next, input.today),
    });
  }
  return { shifts, skipped };
}

function stampLinkedExpectedDate(
  shipment: PoListShipment,
  poId: string,
  expectedDate: string | null,
): PoListShipment {
  if (!shipment.linked_purchase_orders) return shipment;
  let changed = false;
  const linked = shipment.linked_purchase_orders.map((link) => {
    if (link.id !== poId || link.expected_date === expectedDate) return link;
    changed = true;
    return { ...link, expected_date: expectedDate };
  });
  return changed ? { ...shipment, linked_purchase_orders: linked } : shipment;
}

function linksForPlan(
  shipment: PoListShipment,
  poId: string,
  status: PoStatus,
  previousExpectedDate: string | null,
): PoListLinkedPurchaseOrder[] {
  const links = shipment.linked_purchase_orders;
  if (!links || links.length === 0) {
    return [{ id: poId, expected_date: previousExpectedDate, status }];
  }
  if (links.some((link) => link.id === poId)) return [...links];
  return [
    ...links,
    { id: poId, expected_date: previousExpectedDate, status },
  ];
}

/**
 * Optimistic procurement-list update. Reads the current expected date off the
 * row, so queued edits apply one after another. Shipments that do not move
 * keep their dates. Shared shipments on other rows move with this one.
 */
export function shiftPurchaseOrdersForExpectedDate(
  orders: PurchaseOrder[],
  poId: string,
  nextExpectedDate: string | null,
  today: string,
): PurchaseOrder[] {
  const po = orders.find((order) => order.id === poId);
  if (!po) return orders;
  const previousExpectedDate = readIsoDate(po.expected_date);
  const next = readIsoDate(nextExpectedDate);
  if ((nextExpectedDate ?? "") !== "" && nextExpectedDate != null && !next) {
    return orders;
  }
  if (previousExpectedDate === next) return orders;

  const plan = planExpectedDateShipmentShifts({
    poId,
    previousExpectedDate,
    nextExpectedDate: next,
    today,
    shipments: (po.shipments ?? []).map((shipment) => ({
      shipment,
      linkedPurchaseOrders: linksForPlan(
        shipment,
        poId,
        po.status,
        previousExpectedDate,
      ),
    })),
  });
  const shifted = new Map(plan.shifts.map((shift) => [shift.shipment.id, shift.shipment]));

  return orders.map((order) => {
    const hasShifted = order.shipments?.some((shipment) => shifted.has(shipment.id));
    const hasLink = order.shipments?.some((shipment) =>
      shipment.linked_purchase_orders?.some((link) => link.id === poId),
    );
    if (order.id !== poId && !hasShifted && !hasLink) return order;

    const shipments = order.shipments?.map((shipment) => {
      const replacement = shifted.get(shipment.id);
      const nextShipment = replacement
        ? {
            ...replacement,
            linked_purchase_orders:
              replacement.linked_purchase_orders ?? shipment.linked_purchase_orders,
          }
        : shipment;
      return stampLinkedExpectedDate(nextShipment, poId, next);
    });
    if (order.id === poId) {
      return { ...order, expected_date: next, shipments: shipments ?? order.shipments };
    }
    return shipments ? { ...order, shipments } : order;
  });
}

/** Put the last saved expected date and shipment dates back after a failed save. */
export function restorePurchaseOrderExpectedDate(
  orders: PurchaseOrder[],
  poId: string,
  expectedDate: string | null,
  shipments: readonly PoListShipment[],
): PurchaseOrder[] {
  const byId = new Map(shipments.map((shipment) => [shipment.id, shipment]));
  return orders.map((order) => {
    const withDate =
      order.id === poId ? { ...order, expected_date: expectedDate } : order;
    if (!withDate.shipments?.some((shipment) => byId.has(shipment.id))) {
      return withDate;
    }
    return {
      ...withDate,
      shipments: withDate.shipments.map(
        (shipment) => byId.get(shipment.id) ?? shipment,
      ),
    };
  });
}

/**
 * Replace optimistic shipment dates with the rows the server committed.
 * Link data on the server wins when it was loaded with the update.
 */
export function applySavedPurchaseOrderDates(
  orders: PurchaseOrder[],
  saved: PurchaseOrder,
): PurchaseOrder[] {
  const merged = orders.map((order) =>
    order.id === saved.id
      ? mergePurchaseOrderUpdate(order, { ...saved, shipments: undefined })
      : order,
  );
  const serverShipments = saved.shipments;
  if (!serverShipments) return merged;
  const byId = new Map(serverShipments.map((shipment) => [shipment.id, shipment]));
  const expectedDate = readIsoDate(saved.expected_date);
  return merged.map((order) => {
    if (!order.shipments?.some((shipment) => byId.has(shipment.id))) return order;
    return {
      ...order,
      shipments: order.shipments.map((current) => {
        const server = byId.get(current.id);
        if (!server) return current;
        return stampLinkedExpectedDate(
          {
            ...current,
            ...server,
            linked_purchase_orders:
              server.linked_purchase_orders ?? current.linked_purchase_orders,
          },
          saved.id,
          expectedDate,
        );
      }),
    };
  });
}
