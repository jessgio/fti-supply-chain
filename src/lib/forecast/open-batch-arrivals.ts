import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ID_IN_CHUNK, queryInChunks } from "@/lib/supabase/in-chunks";

/** Quantity still on a shipment that has not been inbounded. */
export interface ShipmentArrivalAllocation {
  po_line_id: string;
  shipment_id: string;
  outstanding_qty: number;
  /** yyyy-MM-dd */
  expected_delivery_date: string;
}

export interface ShipmentItemArrivalInput {
  po_line_id: string;
  shipment_id: string;
  quantity: number;
  status: string;
  expected_delivery_date: string | null;
  received_qty: number;
}

interface OpenBatchArrivalInput {
  line_id: string;
  open_qty: number;
  expected_date: string | null;
}

const QTY_EPSILON = 0.00005;

function roundQty(qty: number): number {
  return Math.round(qty * 10000) / 10000;
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Open shipment lines that still have quantity to receive.
 * Closed shipments are already inbounded, so they do not move the next batch date.
 */
export function toOutstandingShipmentAllocations(
  items: ShipmentItemArrivalInput[],
): ShipmentArrivalAllocation[] {
  const allocations: ShipmentArrivalAllocation[] = [];
  for (const item of items) {
    if (item.status === "closed") continue;
    const delivery = item.expected_delivery_date?.slice(0, 10) ?? "";
    if (!delivery) continue;
    const outstanding = Number(item.quantity) - Number(item.received_qty);
    if (!(outstanding > QTY_EPSILON)) continue;
    allocations.push({
      po_line_id: item.po_line_id,
      shipment_id: item.shipment_id,
      outstanding_qty: roundQty(outstanding),
      expected_delivery_date: delivery,
    });
  }
  return allocations;
}

/**
 * Quantity on an open shipment arrives on that shipment's expected delivery date.
 * Quantity not yet on a shipment keeps the purchase order expected date.
 */
export function applyOpenShipmentArrivalDates<T extends OpenBatchArrivalInput>(
  batches: T[],
  allocations: ShipmentArrivalAllocation[],
): Array<T & { batch_key: string }> {
  const byLine = new Map<string, ShipmentArrivalAllocation[]>();
  for (const allocation of allocations) {
    if (!(allocation.outstanding_qty > QTY_EPSILON)) continue;
    if (!allocation.expected_delivery_date) continue;
    const list = byLine.get(allocation.po_line_id) ?? [];
    list.push(allocation);
    byLine.set(allocation.po_line_id, list);
  }

  const resolved: Array<T & { batch_key: string }> = [];
  for (const batch of batches) {
    const lineAllocations = (byLine.get(batch.line_id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.expected_delivery_date.localeCompare(b.expected_delivery_date) ||
          a.shipment_id.localeCompare(b.shipment_id),
      );

    if (lineAllocations.length === 0) {
      resolved.push({ ...batch, batch_key: batch.line_id });
      continue;
    }

    let remaining = batch.open_qty;
    for (const allocation of lineAllocations) {
      if (!(remaining > QTY_EPSILON)) break;
      const qty = Math.min(remaining, allocation.outstanding_qty);
      if (!(qty > QTY_EPSILON)) continue;
      resolved.push({
        ...batch,
        batch_key: `${batch.line_id}:${allocation.shipment_id}`,
        open_qty: roundQty(qty),
        expected_date: allocation.expected_delivery_date,
      });
      remaining -= qty;
    }

    if (remaining > QTY_EPSILON) {
      resolved.push({
        ...batch,
        batch_key: `${batch.line_id}:unshipped`,
        open_qty: roundQty(remaining),
      });
    }
  }

  return resolved;
}

type ShipmentItemRow = {
  po_line_id: string;
  shipment_id: string;
  quantity: number | string;
  shipments:
    | { status: string; expected_delivery_date: string | null }
    | Array<{ status: string; expected_delivery_date: string | null }>
    | null;
};

type InboundReceiveRow = {
  shipment_id: string | null;
  inbound_receive_items:
    | Array<{ po_line_id: string | null; received_qty: number | string }>
    | { po_line_id: string | null; received_qty: number | string }
    | null;
};

async function loadReceivedQtyByShipmentLine(
  supabase: SupabaseClient,
  shipmentIds: string[],
): Promise<Map<string, number>> {
  const received = new Map<string, number>();
  if (shipmentIds.length === 0) return received;

  const rows = await queryInChunks(shipmentIds, ID_IN_CHUNK, (chunk) =>
    fetchAllRows<InboundReceiveRow>(
      () =>
        supabase
          .from("inbound_receives")
          .select(
            "shipment_id, inbound_receive_items(po_line_id, received_qty)",
          )
          .in("shipment_id", chunk) as never,
    ),
  );

  for (const row of rows) {
    if (!row.shipment_id) continue;
    const items = Array.isArray(row.inbound_receive_items)
      ? row.inbound_receive_items
      : row.inbound_receive_items
        ? [row.inbound_receive_items]
        : [];
    for (const item of items) {
      if (!item.po_line_id) continue;
      const key = `${row.shipment_id}:${item.po_line_id}`;
      received.set(key, (received.get(key) ?? 0) + Number(item.received_qty));
    }
  }

  return received;
}

export async function loadOutstandingShipmentAllocations(
  supabase: SupabaseClient,
  poLineIds: string[],
): Promise<ShipmentArrivalAllocation[]> {
  if (poLineIds.length === 0) return [];

  const items = await queryInChunks(poLineIds, ID_IN_CHUNK, (chunk) =>
    fetchAllRows<ShipmentItemRow>(
      () =>
        supabase
          .from("shipment_items")
          .select(
            "po_line_id, shipment_id, quantity, shipments!inner(status, expected_delivery_date)",
          )
          .in("po_line_id", chunk)
          .neq("shipments.status", "closed") as never,
    ),
  );

  const shipmentIds = [...new Set(items.map((item) => item.shipment_id))];
  const receivedByShipmentLine = await loadReceivedQtyByShipmentLine(
    supabase,
    shipmentIds,
  );

  return toOutstandingShipmentAllocations(
    items.map((item) => {
      const shipment = unwrapRelation(item.shipments);
      return {
        po_line_id: item.po_line_id,
        shipment_id: item.shipment_id,
        quantity: Number(item.quantity),
        status: shipment?.status ?? "closed",
        expected_delivery_date: shipment?.expected_delivery_date ?? null,
        received_qty:
          receivedByShipmentLine.get(
            `${item.shipment_id}:${item.po_line_id}`,
          ) ?? 0,
      };
    }),
  );
}

export async function withShipmentArrivalDates<T extends OpenBatchArrivalInput>(
  supabase: SupabaseClient,
  batches: T[],
): Promise<Array<T & { batch_key: string }>> {
  if (batches.length === 0) return [];
  const allocations = await loadOutstandingShipmentAllocations(
    supabase,
    batches.map((batch) => batch.line_id),
  );
  return applyOpenShipmentArrivalDates(batches, allocations);
}
