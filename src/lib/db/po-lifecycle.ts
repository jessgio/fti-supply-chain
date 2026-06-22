import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoStatus } from "@/types/database";

export async function syncPoStatusesAfterShipmentChange(
  supabase: SupabaseClient,
  poIds: string[],
): Promise<void> {
  for (const poId of poIds) {
    await recalculatePoStatus(supabase, poId);
  }
}

export async function recalculatePoStatus(
  supabase: SupabaseClient,
  poId: string,
): Promise<void> {
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", poId)
    .maybeSingle();
  if (poError) throw poError;
  if (!po || po.status === "cancelled" || po.status === "received") return;

  const { data: lines, error: linesError } = await supabase
    .from("purchase_order_lines")
    .select("qty_ordered, qty_received, is_closed")
    .eq("po_id", poId);
  if (linesError) throw linesError;

  const allLines = lines ?? [];
  const allReceived = allLines.every(
    (l) =>
      l.is_closed ||
      Number(l.qty_received) >= Number(l.qty_ordered),
  );
  const anyReceived = allLines.some((l) => Number(l.qty_received) > 0);

  if (allReceived && anyReceived) {
    await supabase
      .from("purchase_orders")
      .update({ status: "received" satisfies PoStatus, updated_at: new Date().toISOString() })
      .eq("id", poId);
    return;
  }

  const { data: shipments, error: shipError } = await supabase
    .from("shipment_purchase_orders")
    .select("shipments(status, estimated_departure_date)")
    .eq("po_id", poId);
  if (shipError) throw shipError;

  const hasActiveShipment = (shipments ?? []).some((link) => {
    const raw = link.shipments as
      | { status: string; estimated_departure_date: string }
      | { status: string; estimated_departure_date: string }[]
      | null;
    const s = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    if (!s) return false;
    return s.status !== "closed";
  });

  if (hasActiveShipment || anyReceived) {
    const newStatus: PoStatus = "in_transit";
    if (po.status !== newStatus) {
      await supabase
        .from("purchase_orders")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", poId);
    }
  }
}

export function computePoDisplayStatus(
  status: PoStatus,
  lines: Array<{ qty_ordered: number; qty_received: number; is_closed?: boolean }>,
  hasShipments: boolean,
): string {
  const anyReceived = lines.some((l) => Number(l.qty_received) > 0);
  const allReceived = lines.every(
    (l) =>
      l.is_closed || Number(l.qty_received) >= Number(l.qty_ordered),
  );

  if (status === "cancelled") return "cancelled";
  if (status === "received" || (allReceived && anyReceived)) return "received";
  if (anyReceived && !allReceived) return "partially_received";
  if (hasShipments && status === "in_transit") return "shipped";
  return status;
}
