import type { PoShortfallResolution, ShipmentLineAllocation } from "@/types/database";

export type ShortShipLine = {
  po_line_id: string;
  sku_code: string;
  available: number;
  shipQty: number;
  shortBy: number;
  /** Total allocated across all shipments after this save. */
  totalAllocatedAfterSave: number;
};

/**
 * Lines where the user is shipping less than remaining available PO qty.
 * `currentAllocatedOnThisShipment` is the qty already on this shipment when editing (0 on create).
 */
export function detectShortShipLines(
  allocations: ShipmentLineAllocation[],
  lineQtys: Record<string, number>,
  currentAllocatedOnThisShipment: Record<string, number> = {},
): ShortShipLine[] {
  const short: ShortShipLine[] = [];
  for (const a of allocations) {
    const shipQty = lineQtys[a.po_line_id] ?? 0;
    if (shipQty <= 0) continue;
    if (shipQty >= a.qty_available) continue;
    const priorOnThis = currentAllocatedOnThisShipment[a.po_line_id] ?? 0;
    // qty_allocated includes this shipment when editing; rebuild total after save:
    // (allocated - prior on this) + new ship qty
    const totalAllocatedAfterSave =
      a.qty_allocated - priorOnThis + shipQty;
    short.push({
      po_line_id: a.po_line_id,
      sku_code: a.sku_code,
      available: a.qty_available,
      shipQty,
      shortBy: a.qty_available - shipQty,
      totalAllocatedAfterSave,
    });
  }
  return short;
}

/** Payload fields for create/update shipment when short-shipping. */
export function shortShipResolutionPayload(
  poResolution: PoShortfallResolution | null | undefined,
): { po_resolution?: PoShortfallResolution } {
  if (!poResolution) return {};
  return { po_resolution: poResolution };
}
