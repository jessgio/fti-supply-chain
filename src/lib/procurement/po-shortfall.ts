import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoShortfallResolution } from "@/types/database";
import { closePoLine } from "@/lib/db/procurement";

/**
 * After a short close (inbound short-receive or deferred ship leave_as_is):
 * - leave_as_is: short-close PO lines (keep ordered qty, mark closed)
 * - adjust_ordered: set qty_ordered to qty_received (or short-close if nothing received)
 */
export async function resolvePoShortfallAfterShortClose(
  supabase: SupabaseClient,
  poLineIds: string[],
  resolution: PoShortfallResolution,
): Promise<void> {
  if (poLineIds.length === 0) return;

  const { data: lines, error } = await supabase
    .from("purchase_order_lines")
    .select("id, qty_ordered, qty_received, is_closed")
    .in("id", poLineIds);
  if (error) throw error;

  for (const line of lines ?? []) {
    if (line.is_closed) continue;
    const qtyOrdered = Number(line.qty_ordered);
    const qtyReceived = Number(line.qty_received);
    if (qtyReceived >= qtyOrdered) continue;

    if (resolution === "leave_as_is") {
      await closePoLine(supabase, line.id);
      continue;
    }

    // adjust_ordered: lower ordered qty to match received (or short-close if nothing received)
    if (qtyReceived <= 0) {
      await closePoLine(supabase, line.id);
      continue;
    }

    const { error: updateError } = await supabase
      .from("purchase_order_lines")
      .update({ qty_ordered: qtyReceived })
      .eq("id", line.id);
    if (updateError) throw updateError;
  }
}

/**
 * At ship time for adjust_ordered: set qty_ordered to the new total allocated
 * (after this shipment save) for each short line.
 */
export async function adjustPoOrderedToAllocated(
  supabase: SupabaseClient,
  adjustments: Array<{ po_line_id: string; qty_ordered: number }>,
): Promise<void> {
  for (const adj of adjustments) {
    if (!Number.isFinite(adj.qty_ordered) || adj.qty_ordered < 0) {
      throw new Error("Adjusted ordered quantity must be a non-negative number.");
    }

    const { data: line, error } = await supabase
      .from("purchase_order_lines")
      .select("id, qty_received, is_closed")
      .eq("id", adj.po_line_id)
      .maybeSingle();
    if (error) throw error;
    if (!line) throw new Error(`PO line ${adj.po_line_id} not found.`);
    if (line.is_closed) continue;

    const qtyReceived = Number(line.qty_received);
    if (adj.qty_ordered < qtyReceived) {
      throw new Error(
        "Cannot set ordered quantity below already received quantity.",
      );
    }

    if (adj.qty_ordered <= 0 && qtyReceived <= 0) {
      await closePoLine(supabase, adj.po_line_id);
      continue;
    }

    const { error: updateError } = await supabase
      .from("purchase_order_lines")
      .update({ qty_ordered: adj.qty_ordered })
      .eq("id", adj.po_line_id);
    if (updateError) throw updateError;
  }
}

export function isPoShortfallResolution(
  value: unknown,
): value is PoShortfallResolution {
  return value === "leave_as_is" || value === "adjust_ordered";
}
