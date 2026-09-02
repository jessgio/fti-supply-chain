import { format, startOfMonth, subMonths } from "date-fns";
import type { SalesRow } from "@/types/database";

export type SalesImportMode = "incremental" | "full";

/** Rolling upload window: current month plus the two prior calendar months. */
export const SALES_UPLOAD_MONTHS = 3;

export function getSalesUploadCutoff(referenceDate = new Date()): string {
  const currentMonthStart = startOfMonth(referenceDate);
  const cutoff = startOfMonth(
    subMonths(currentMonthStart, SALES_UPLOAD_MONTHS - 1),
  );
  return format(cutoff, "yyyy-MM-dd");
}

export function filterSalesRowsForUpload(
  rows: SalesRow[],
  referenceDate = new Date(),
): {
  eligible: SalesRow[];
  skippedOlder: number;
  cutoff: string;
  rangeStart: string;
  rangeEnd: string;
} {
  const cutoff = getSalesUploadCutoff(referenceDate);
  const eligible: SalesRow[] = [];
  let skippedOlder = 0;

  for (const row of rows) {
    if (row.sale_date < cutoff) {
      skippedOlder++;
      continue;
    }
    eligible.push(row);
  }

  if (eligible.length === 0) {
    return { eligible, skippedOlder, cutoff, rangeStart: cutoff, rangeEnd: cutoff };
  }

  const dates = eligible.map((row) => row.sale_date).sort();
  return {
    eligible,
    skippedOlder,
    cutoff,
    rangeStart: dates[0]!,
    rangeEnd: dates[dates.length - 1]!,
  };
}

/** Full WMS reprocess: every row in the file replaces its sale_date range in the DB. */
export function filterSalesRowsForFullReprocess(rows: SalesRow[]): {
  eligible: SalesRow[];
  skippedOlder: number;
  cutoff: string;
  rangeStart: string;
  rangeEnd: string;
} {
  if (rows.length === 0) {
    return {
      eligible: [],
      skippedOlder: 0,
      cutoff: "",
      rangeStart: "",
      rangeEnd: "",
    };
  }

  const dates = rows.map((row) => row.sale_date).sort();
  return {
    eligible: rows,
    skippedOlder: 0,
    cutoff: dates[0]!,
    rangeStart: dates[0]!,
    rangeEnd: dates[dates.length - 1]!,
  };
}

export function isSalesRowEligibleForImport(
  row: SalesRow,
  mode: SalesImportMode,
  cutoff: string,
): boolean {
  return mode === "full" || row.sale_date >= cutoff;
}
