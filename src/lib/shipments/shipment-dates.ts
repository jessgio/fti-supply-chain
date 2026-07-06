import type { ShipmentStatus, ShipmentType } from "@/lib/shipments/constants";
import { DEFAULT_TRANSIT_DAYS } from "@/lib/shipments/constants";

export function getDefaultTransitDays(type: ShipmentType): number {
  return DEFAULT_TRANSIT_DAYS[type];
}

export function calculateExpectedDeliveryDate(
  estimatedDepartureDate: string,
  transitDays: number,
  delayDays: number,
): string {
  const base = new Date(`${estimatedDepartureDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    throw new Error("Invalid estimated departure date");
  }
  const delivery = new Date(base);
  delivery.setDate(delivery.getDate() + transitDays + delayDays);
  return delivery.toISOString().slice(0, 10);
}

export function formatDisplayDate(
  dateStr: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (dateStr == null || dateStr === "") return "—";
  const date =
    dateStr instanceof Date ? dateStr : new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
}

export function hasDepartureDatePassed(
  dateStr: string | null | undefined,
): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const departure = new Date(`${dateStr}T00:00:00`);
  return departure <= today;
}

/** Derive planned vs in_transit from departure date; preserve delivered/closed. */
export function resolveShipmentStatusFromDeparture(
  current: ShipmentStatus,
  departureDate: string,
): ShipmentStatus {
  if (current === "delivered" || current === "closed") return current;
  if (hasDepartureDatePassed(departureDate)) return "in_transit";
  return "planned";
}
