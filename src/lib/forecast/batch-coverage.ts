import { addDays, format, startOfDay } from "date-fns";

export interface IncomingBatch {
  /** yyyy-MM-dd */
  arrivalDate: string;
  qty: number;
  lineId: string;
}

export interface SkuPipelineCoverage {
  /** Per open PO line: when that batch qty is fully consumed (FIFO). */
  batch_depletion_by_line: Map<string, string>;
  /** When on-hand inventory hits the reorder point after the latest batch arrives. */
  next_reorder_date: string | null;
  /** Line id of the chronologically last incoming batch. */
  latest_line_id: string | null;
}

const MAX_SIM_DAYS = 365 * 5;

/**
 * Simulate inventory depletion: current stock is consumed first, then each
 * incoming batch in arrival-date order. Arrivals are applied before daily
 * consumption on the same day.
 */
export function projectSkuPipelineCoverage(
  currentStock: number,
  dailyBurn: number,
  reorderPointQty: number,
  batches: IncomingBatch[],
  referenceDate: Date = new Date(),
): SkuPipelineCoverage {
  const empty: SkuPipelineCoverage = {
    batch_depletion_by_line: new Map(),
    next_reorder_date: null,
    latest_line_id: null,
  };

  if (dailyBurn <= 0 || batches.length === 0) return empty;

  const sorted = [...batches].sort(
    (a, b) =>
      a.arrivalDate.localeCompare(b.arrivalDate) ||
      a.lineId.localeCompare(b.lineId),
  );

  const latestLineId = sorted[sorted.length - 1]?.lineId ?? null;

  let stock = currentStock;
  let date = startOfDay(referenceDate);
  let batchIdx = 0;

  const stockBeforeArrival = new Map<string, number>();
  const arrived = new Set<string>();
  const batchDepletion = new Map<string, string>();
  let latestArrived = false;
  let nextReorderDate: string | null = null;

  for (let day = 0; day < MAX_SIM_DAYS; day++) {
    const dateStr = format(date, "yyyy-MM-dd");

    while (
      batchIdx < sorted.length &&
      sorted[batchIdx].arrivalDate <= dateStr
    ) {
      const batch = sorted[batchIdx];
      stockBeforeArrival.set(batch.lineId, stock);
      stock += batch.qty;
      arrived.add(batch.lineId);
      if (batch.lineId === latestLineId) latestArrived = true;
      batchIdx++;
    }

    for (const lineId of arrived) {
      if (batchDepletion.has(lineId)) continue;
      const floor = stockBeforeArrival.get(lineId);
      if (floor !== undefined && stock <= floor) {
        batchDepletion.set(lineId, dateStr);
      }
    }

    if (latestArrived && !nextReorderDate && stock <= reorderPointQty) {
      nextReorderDate = dateStr;
    }

    if (
      batchIdx >= sorted.length &&
      nextReorderDate !== null &&
      batchDepletion.size === sorted.length
    ) {
      break;
    }

    stock -= dailyBurn;
    if (stock < 0) stock = 0;
    date = addDays(date, 1);
  }

  return {
    batch_depletion_by_line: batchDepletion,
    next_reorder_date: nextReorderDate,
    latest_line_id: latestLineId,
  };
}
