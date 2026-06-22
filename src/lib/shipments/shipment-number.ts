import type { ShipmentType } from "@/lib/shipments/constants";

const PO_NUMBER_PATTERN = /^PO-([A-Z0-9]{3})-(\d{8})-(\d{3})$/i;
const SHIPMENT_NUMBER_PATTERN =
  /^SH-(SEA|AIR|LOC)-([A-Z0-9]{3})-(\d{8})-(\d{3})$/i;

export function shipmentModeCode(
  shipmentType: ShipmentType,
): "SEA" | "AIR" | "LOC" {
  if (shipmentType === "local") return "LOC";
  if (shipmentType === "air") return "AIR";
  return "SEA";
}

export function formatShipmentDateYmd(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid shipment date");
  }
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function buildDefaultShipmentNumber(
  shipmentType: ShipmentType,
  vendorCode: string,
  dateStr: string,
  sequence: string,
): string {
  const mode = shipmentModeCode(shipmentType);
  return `SH-${mode}-${vendorCode.toUpperCase()}-${dateStr}-${sequence}`;
}

export function parseStandardPoNumber(
  poNumber: string,
): { vendorCode: string; dateStr: string; sequence: string } | null {
  const match = poNumber.trim().match(PO_NUMBER_PATTERN);
  if (!match) return null;
  const [, vendorCode, dateStr, sequence] = match;
  return { vendorCode: vendorCode.toUpperCase(), dateStr, sequence };
}

export function defaultShipmentNumberFromPoNumber(
  poNumber: string,
  shipmentType: ShipmentType,
  dateStr?: string,
): string | null {
  const parsed = parseStandardPoNumber(poNumber);
  if (!parsed) return null;
  return buildDefaultShipmentNumber(
    shipmentType,
    parsed.vendorCode,
    dateStr ?? parsed.dateStr,
    parsed.sequence,
  );
}

export function generateFallbackShipmentNumber(
  shipmentType: ShipmentType,
): string {
  const dateStr = formatShipmentDateYmd(new Date());
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  const mode = shipmentModeCode(shipmentType);
  return `SH-${mode}-${rand}-${dateStr}-001`;
}

export function shipmentNumberPrefix(
  shipmentType: ShipmentType,
  vendorCode: string,
  dateStr: string,
): string {
  const mode = shipmentModeCode(shipmentType);
  return `SH-${mode}-${vendorCode.toUpperCase()}-${dateStr}-`;
}

const DUPLICATE_SUFFIX = /\s\((\d+)\)$/;

export function stripShipmentDuplicateSuffix(shipmentNumber: string): string {
  return shipmentNumber.trim().replace(DUPLICATE_SUFFIX, "");
}

export function shipmentDuplicateIndex(shipmentNumber: string): number {
  const match = shipmentNumber.trim().match(DUPLICATE_SUFFIX);
  return match ? parseInt(match[1], 10) : 1;
}

export function appendShipmentDuplicateSuffix(
  baseNumber: string,
  index: number,
): string {
  const base = stripShipmentDuplicateSuffix(baseNumber);
  if (index <= 1) return base;
  return `${base} (${index})`;
}

export function nextShipmentDuplicateIndex(existingNumbers: string[]): number {
  if (!existingNumbers.length) return 1;
  return Math.max(...existingNumbers.map(shipmentDuplicateIndex)) + 1;
}

export function parseStandardShipmentNumber(shipmentNumber: string): {
  mode: "SEA" | "AIR" | "LOC";
  vendorCode: string;
  dateStr: string;
  sequence: string;
} | null {
  const match = shipmentNumber.trim().match(SHIPMENT_NUMBER_PATTERN);
  if (!match) return null;
  const [, mode, vendorCode, dateStr, sequence] = match;
  return {
    mode: mode as "SEA" | "AIR" | "LOC",
    vendorCode: vendorCode.toUpperCase(),
    dateStr,
    sequence,
  };
}
