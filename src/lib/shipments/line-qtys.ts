import type { ShipmentLineAllocation } from "@/types/database";

/** Keep existing ship quantities; auto-fill newly added PO lines with available qty. */
export function mergeAutoFillLineQtys(
  prev: Record<string, number>,
  allocations: ShipmentLineAllocation[],
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const allocation of allocations) {
    if (allocation.po_line_id in prev) {
      next[allocation.po_line_id] = prev[allocation.po_line_id];
    } else {
      next[allocation.po_line_id] = allocation.qty_available;
    }
  }
  return next;
}
