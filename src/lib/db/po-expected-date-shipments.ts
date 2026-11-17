import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planExpectedDateShipmentShifts,
  todayIsoDate,
  type ShipmentExpectedDateInput,
} from "@/lib/procurement/po-expected-date-shipments";
import { parsePoListShipment } from "@/lib/procurement/po-list-shipments";
import { ID_IN_CHUNK, queryInChunks } from "@/lib/supabase/in-chunks";
import type { PoListShipment } from "@/types/database";

const SHIPMENT_SHIFT_SELECT = `
  id,
  shipment_number,
  shipment_type,
  status,
  estimated_departure_date,
  expected_delivery_date,
  transit_days,
  delay_days,
  shipment_purchase_orders (
    po_id,
    purchase_orders (
      id,
      expected_date,
      status
    )
  )
`;

export interface AppliedExpectedDateShipments {
  shipments: PoListShipment[];
  affectedPurchaseOrderIds: string[];
}

function rpcError(error: { message?: string } | null): Error | null {
  if (!error) return null;
  return new Error(error.message || "Failed to update the expected date.");
}

function parseRpcShipments(data: unknown): PoListShipment[] {
  const rows =
    data && typeof data === "object" && "shipments" in data
      ? (data as { shipments: unknown }).shipments
      : null;
  if (!Array.isArray(rows)) return [];
  const shipments: PoListShipment[] = [];
  for (const row of rows) {
    const shipment = parsePoListShipment(row);
    if (shipment) shipments.push(shipment);
  }
  return shipments;
}

async function loadLinkedShipments(
  supabase: SupabaseClient,
  poId: string,
): Promise<ShipmentExpectedDateInput[]> {
  const { data: links, error: linkError } = await supabase
    .from("shipment_purchase_orders")
    .select("shipment_id")
    .eq("po_id", poId);
  if (linkError) throw linkError;
  const ids = (links ?? [])
    .map((link) => {
      const row = link as { shipment_id?: string };
      return row.shipment_id ?? "";
    })
    .filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  const rows = await queryInChunks(ids, ID_IN_CHUNK, async (chunk) => {
    const { data, error } = await supabase
      .from("shipments")
      .select(SHIPMENT_SHIFT_SELECT)
      .in("id", chunk);
    if (error) throw error;
    return (data ?? []) as unknown[];
  });

  const inputs: ShipmentExpectedDateInput[] = [];
  for (const row of rows) {
    const shipment = parsePoListShipment(row);
    if (!shipment) {
      throw new Error("A linked shipment has an invalid departure date.");
    }
    inputs.push({
      shipment,
      linkedPurchaseOrders: shipment.linked_purchase_orders ?? [],
    });
  }
  return inputs;
}

/**
 * Write the new expected date and any shipment departures that follow it.
 * The database function commits both, or neither.
 */
export async function applyExpectedDateAndShiftShipments(
  supabase: SupabaseClient,
  poId: string,
  previousExpectedDate: string | null,
  nextExpectedDate: string | null,
): Promise<AppliedExpectedDateShipments> {
  const loaded = await loadLinkedShipments(supabase, poId);
  const today = todayIsoDate();
  const plan = planExpectedDateShipmentShifts({
    poId,
    previousExpectedDate,
    nextExpectedDate,
    shipments: loaded,
    today,
  });
  const shifts = [...plan.shifts].sort((a, b) =>
    a.shipment.id.localeCompare(b.shipment.id),
  );

  const { data, error } = await supabase.rpc(
    "apply_po_expected_date_and_shipment_shifts",
    {
      p_po_id: poId,
      p_expected_date: nextExpectedDate,
      p_previous_expected_date: previousExpectedDate,
      p_shifts: shifts.map((shift) => ({
        id: shift.shipment.id,
        from_departure: shift.fromDeparture,
        from_status: shift.fromStatus,
        estimated_departure_date: shift.shipment.estimated_departure_date,
        status: shift.shipment.status,
      })),
    },
  );
  const failed = rpcError(error);
  if (failed) throw failed;

  const committed = parseRpcShipments(data);
  const committedById = new Map(committed.map((shipment) => [shipment.id, shipment]));
  const shiftedById = new Map(shifts.map((shift) => [shift.shipment.id, shift.shipment]));
  const affected = new Set<string>();

  const shipments = loaded.map((row) => {
    const server = committedById.get(row.shipment.id);
    const planned = shiftedById.get(row.shipment.id);
    if (planned) {
      for (const link of row.linkedPurchaseOrders) affected.add(link.id);
      affected.add(poId);
    }
    const dates = server ?? planned ?? row.shipment;
    const links = row.shipment.linked_purchase_orders?.map((link) =>
      link.id === poId ? { ...link, expected_date: nextExpectedDate } : link,
    );
    return {
      ...row.shipment,
      ...dates,
      linked_purchase_orders: links ?? dates.linked_purchase_orders,
    };
  });

  if (committed.length > 0 && loaded.length === 0) {
    return { shipments: committed, affectedPurchaseOrderIds: [] };
  }

  return {
    shipments,
    affectedPurchaseOrderIds: [...affected],
  };
}
