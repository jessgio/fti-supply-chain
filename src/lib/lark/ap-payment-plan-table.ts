export type PlanTableSortKey = "payment" | "date" | "amount";
export type PlanTableSortDir = "asc" | "desc";

export type PlanTableQuery = {
  query: string;
  label: string;
  sortKey: PlanTableSortKey | null;
  sortDir: PlanTableSortDir;
};

type PlanTableRow = {
  dateYmd: string;
  amount: number;
  remarks: string;
};

/** First segment of a payment-plan remark, before the PO and product list. */
export function paymentLineLabel(remarks: string): string {
  const label = remarks.split(" - ")[0]?.trim();
  return label || "Payment";
}

export function paymentLineLabels(rows: readonly { remarks: string }[]): string[] {
  const labels: string[] = [];
  for (const row of rows) {
    const label = paymentLineLabel(row.remarks);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * Indexes of payment lines to show. Filtering and sorting only change the
 * view; the returned indexes still point at the original rows.
 */
export function visiblePlanRowIndexes(
  rows: readonly PlanTableRow[],
  options: PlanTableQuery,
): number[] {
  const query = options.query.trim().toLowerCase();
  const indexes = rows
    .map((_, index) => index)
    .filter((index) => {
      const row = rows[index];
      if (!row) return false;
      const label = paymentLineLabel(row.remarks);
      if (options.label && label !== options.label) return false;
      if (!query) return true;
      const haystack = `${label} ${row.dateYmd} ${row.amount} ${row.remarks}`.toLowerCase();
      return haystack.includes(query);
    });

  if (!options.sortKey) return indexes;

  const dir = options.sortDir === "asc" ? 1 : -1;
  const key = options.sortKey;
  return [...indexes].sort((a, b) => {
    const left = rows[a];
    const right = rows[b];
    if (!left || !right) return a - b;
    let cmp = 0;
    if (key === "date") cmp = left.dateYmd.localeCompare(right.dateYmd);
    else if (key === "amount") cmp = left.amount - right.amount;
    else {
      cmp = paymentLineLabel(left.remarks).localeCompare(
        paymentLineLabel(right.remarks),
      );
    }
    if (cmp === 0) return a - b;
    return cmp * dir;
  });
}
