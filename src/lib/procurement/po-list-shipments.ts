import { resolveShipmentStatusFromDeparture } from "@/lib/shipments/shipment-dates";
import type {
  PoListShipment,
  PurchaseOrder,
  Shipment,
  ShipmentStatus,
  ShipmentType,
} from "@/types/database";

const SHIPMENT_TYPES = new Set<ShipmentType>(["sea", "air", "local"]);
const SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  "planned",
  "in_transit",
  "delivered",
  "closed",
]);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Add calendar days without using the local timezone. */
export function addIsoDays(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new Error("Invalid date");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetweenIso(start: string, end: string): number {
  const startMatch = ISO_DATE.exec(start);
  const endMatch = ISO_DATE.exec(end);
  if (!startMatch || !endMatch) throw new Error("Invalid date");
  const startUtc = Date.UTC(
    Number(startMatch[1]),
    Number(startMatch[2]) - 1,
    Number(startMatch[3]),
  );
  const endUtc = Date.UTC(
    Number(endMatch[1]),
    Number(endMatch[2]) - 1,
    Number(endMatch[3]),
  );
  return Math.round((endUtc - startUtc) / 86_400_000);
}

function asShipmentType(value: unknown): ShipmentType {
  return typeof value === "string" && SHIPMENT_TYPES.has(value as ShipmentType)
    ? (value as ShipmentType)
    : "sea";
}

function asShipmentStatus(value: unknown): ShipmentStatus {
  return typeof value === "string" &&
    SHIPMENT_STATUSES.has(value as ShipmentStatus)
    ? (value as ShipmentStatus)
    : "planned";
}

function shipmentFromEmbed(value: unknown): PoListShipment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const departure =
    typeof row.estimated_departure_date === "string"
      ? row.estimated_departure_date.slice(0, 10)
      : "";
  const delivery =
    typeof row.expected_delivery_date === "string"
      ? row.expected_delivery_date.slice(0, 10)
      : "";
  if (typeof row.id !== "string" || !isIsoDate(departure) || !isIsoDate(delivery)) {
    return null;
  }
  const transit = Number(row.transit_days ?? 0);
  const delay = Number(row.delay_days ?? 0);
  return {
    id: row.id,
    shipment_number:
      typeof row.shipment_number === "string" ? row.shipment_number : "",
    shipment_type: asShipmentType(row.shipment_type),
    status: asShipmentStatus(row.status),
    estimated_departure_date: departure,
    expected_delivery_date: delivery,
    transit_days: Number.isFinite(transit) && transit >= 0 ? transit : 0,
    delay_days: Number.isFinite(delay) && delay >= 0 ? delay : 0,
  };
}

/** Map the purchase_orders → shipment_purchase_orders embed into list rows. */
export function mapPoListShipments(links: unknown): PoListShipment[] {
  if (!Array.isArray(links)) return [];
  const seen = new Set<string>();
  const shipments: PoListShipment[] = [];
  for (const link of links) {
    if (!link || typeof link !== "object") continue;
    const raw = (link as { shipments?: unknown }).shipments;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const row of rows) {
      const shipment = shipmentFromEmbed(row);
      if (!shipment || seen.has(shipment.id)) continue;
      seen.add(shipment.id);
      shipments.push(shipment);
    }
  }
  shipments.sort(
    (a, b) =>
      a.estimated_departure_date.localeCompare(b.estimated_departure_date) ||
      a.shipment_number.localeCompare(b.shipment_number),
  );
  return shipments;
}

/**
 * Shipment whose dates the procurement list edits.
 * Prefer the soonest shipment that is not closed. If every shipment is
 * closed, show the latest departure as read-only.
 */
export function procurementListShipment(
  shipments: readonly PoListShipment[] | undefined,
): PoListShipment | null {
  if (!shipments || shipments.length === 0) return null;
  let soonestOpen: PoListShipment | null = null;
  let latest: PoListShipment | null = null;
  for (const shipment of shipments) {
    if (
      !latest ||
      shipment.estimated_departure_date > latest.estimated_departure_date ||
      (shipment.estimated_departure_date === latest.estimated_departure_date &&
        shipment.shipment_number > latest.shipment_number)
    ) {
      latest = shipment;
    }
    if (shipment.status === "closed") continue;
    if (
      !soonestOpen ||
      shipment.estimated_departure_date < soonestOpen.estimated_departure_date ||
      (shipment.estimated_departure_date ===
        soonestOpen.estimated_departure_date &&
        shipment.shipment_number < soonestOpen.shipment_number)
    ) {
      soonestOpen = shipment;
    }
  }
  return soonestOpen ?? latest;
}

export function canLogShipmentFromList(
  po: Pick<PurchaseOrder, "status" | "shipments">,
): boolean {
  if (po.status === "received" || po.status === "cancelled") return false;
  return Array.isArray(po.shipments) && po.shipments.length === 0;
}

export type ShipmentDateField = "start" | "end";

export interface ShipmentWindowBody {
  estimated_departure_date?: string;
  transit_days?: number;
  delay_days?: number;
}

export type ShipmentWindowPatch =
  | { body: ShipmentWindowBody; next: PoListShipment }
  | { error: string };

/**
 * Build the same shipment update the detail page persists.
 * Start writes estimated_departure_date and lets arrival move by the current
 * transit and delay. End writes transit_days and delay_days so
 * expected_delivery_date stays departure + transit + delay.
 */
export function patchShipmentWindow(
  shipment: PoListShipment,
  field: ShipmentDateField,
  date: string,
): ShipmentWindowPatch {
  if (!isIsoDate(date)) return { error: "Choose a valid date." };
  if (shipment.status === "closed") {
    return { error: "Closed shipments can't be edited." };
  }

  if (field === "start") {
    const transit = shipment.transit_days;
    const delay = shipment.delay_days;
    return {
      body: { estimated_departure_date: date },
      next: {
        ...shipment,
        status: resolveShipmentStatusFromDeparture(shipment.status, date),
        estimated_departure_date: date,
        expected_delivery_date: addIsoDays(date, transit + delay),
      },
    };
  }

  const days = daysBetweenIso(shipment.estimated_departure_date, date);
  if (days < 0) {
    return {
      error: "Ship end has to be on or after the ship start date.",
    };
  }
  const transitDays = Math.min(shipment.transit_days, days);
  const delayDays = days - transitDays;
  return {
    body: { transit_days: transitDays, delay_days: delayDays },
    next: {
      ...shipment,
      transit_days: transitDays,
      delay_days: delayDays,
      expected_delivery_date: date,
    },
  };
}

/**
 * Apply queued start and end picks against the last saved shipment.
 * Start is applied first so a new departure shifts the window. An end date
 * that would fall before that departure is dropped in favor of the start.
 */
export function patchDesiredWindow(
  baseline: PoListShipment,
  desired: { start?: string; end?: string },
): ShipmentWindowPatch {
  let current = baseline;
  const body: ShipmentWindowBody = {};
  if (desired.start && desired.start !== current.estimated_departure_date) {
    const patch = patchShipmentWindow(current, "start", desired.start);
    if ("error" in patch) return patch;
    current = patch.next;
    Object.assign(body, patch.body);
  }
  if (desired.end && desired.end !== current.expected_delivery_date) {
    const patch = patchShipmentWindow(current, "end", desired.end);
    if ("error" in patch) {
      if (desired.start) return { body, next: current };
      return patch;
    }
    current = patch.next;
    Object.assign(body, patch.body);
  }
  return { body, next: current };
}

export function toPoListShipment(shipment: Shipment): PoListShipment {
  return {
    id: shipment.id,
    shipment_number: shipment.shipment_number,
    shipment_type: shipment.shipment_type,
    status: shipment.status,
    estimated_departure_date: shipment.estimated_departure_date.slice(0, 10),
    expected_delivery_date: shipment.expected_delivery_date.slice(0, 10),
    transit_days: shipment.transit_days,
    delay_days: shipment.delay_days,
  };
}

/** Keep list-only embeds when a detail PATCH omits them. */
export function mergePurchaseOrderUpdate(
  current: PurchaseOrder,
  updated: PurchaseOrder,
): PurchaseOrder {
  return {
    ...current,
    ...updated,
    lines: updated.lines ?? current.lines,
    payments: updated.payments ?? current.payments,
    shipments: updated.shipments ?? current.shipments,
    lark_submissions: updated.lark_submissions ?? current.lark_submissions,
  };
}

export function withShipmentSummary(
  orders: PurchaseOrder[],
  summary: PoListShipment,
  linkedPoIds: readonly string[],
): PurchaseOrder[] {
  const linked = new Set(linkedPoIds);
  return orders.map((po) => {
    const shipments = po.shipments;
    if (!shipments) {
      if (!linked.has(po.id)) return po;
      return { ...po, shipments: [summary] };
    }
    const index = shipments.findIndex((row) => row.id === summary.id);
    if (index === -1) {
      if (!linked.has(po.id)) return po;
      return { ...po, shipments: [...shipments, summary] };
    }
    const next = shipments.slice();
    next[index] = summary;
    return { ...po, shipments: next };
  });
}
