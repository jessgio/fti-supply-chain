import { isWasteCategory } from "@/lib/extracts/categories";
import type {
  ExtractCategory,
  ExtractCategoryTotal,
  ExtractTransaction,
} from "@/types/database";

export interface LedgerRange {
  from?: string | null;
  to?: string | null;
}

type LedgerRow = Pick<
  ExtractTransaction,
  "txn_date" | "seq" | "received" | "issued" | "balance" | "category"
>;

/** Chronological order: by date, then by the row's position in the screenshot. */
export function orderTransactions<T extends { txn_date: string; seq: number }>(
  txns: T[],
): T[] {
  return [...txns].sort(
    (a, b) => a.txn_date.localeCompare(b.txn_date) || a.seq - b.seq,
  );
}

function inRange(txn: { txn_date: string }, range: LedgerRange): boolean {
  if (range.from && txn.txn_date < range.from) return false;
  if (range.to && txn.txn_date > range.to) return false;
  return true;
}

/** Running balance just before `boundary` (exclusive). Null boundary = ledger open. */
function balanceBefore(ordered: LedgerRow[], boundary?: string | null): number {
  if (boundary) {
    const before = ordered.filter((t) => t.txn_date < boundary);
    for (let i = before.length - 1; i >= 0; i--) {
      if (before[i].balance !== null) return before[i].balance as number;
    }
  }
  // Nothing before the window: reverse the first recorded balance to get the
  // opening balance of the whole ledger.
  const first = ordered.find((t) => t.balance !== null);
  if (!first) return 0;
  return (first.balance ?? 0) - first.received + first.issued;
}

/** Latest recorded balance at or before the end of the window. */
function balanceAtEnd(
  ordered: LedgerRow[],
  range: LedgerRange,
  fallback: number,
): number {
  const upTo = range.to
    ? ordered.filter((t) => t.txn_date <= range.to!)
    : ordered;
  for (let i = upTo.length - 1; i >= 0; i--) {
    if (upTo[i].balance !== null) return upTo[i].balance as number;
  }
  return fallback;
}

export interface LedgerStats {
  starting_balance: number;
  ending_balance: number;
  total_received: number;
  total_issued: number;
  waste_issued: number;
  waste_pct: number | null;
  txn_count: number;
  first_date: string | null;
  last_date: string | null;
  category_totals: ExtractCategoryTotal[];
}

/**
 * Compute balance and flow statistics for a ledger, optionally constrained to a
 * date range. Starting/ending balances are read from the recorded running
 * balance column (the source of truth) using the *full* ledger, while flow
 * totals only count transactions inside the window.
 */
export function computeLedgerStats(
  fullLedger: LedgerRow[],
  range: LedgerRange = {},
): LedgerStats {
  const ordered = orderTransactions(fullLedger);
  const windowRows = ordered.filter((t) => inRange(t, range));

  const starting = balanceBefore(ordered, range.from);
  const ending = balanceAtEnd(ordered, range, starting);

  let totalReceived = 0;
  let totalIssued = 0;
  let wasteIssued = 0;
  const byCategory = new Map<ExtractCategory, ExtractCategoryTotal>();

  for (const row of windowRows) {
    totalReceived += row.received;
    totalIssued += row.issued;
    if (isWasteCategory(row.category)) wasteIssued += row.issued;

    const agg =
      byCategory.get(row.category) ??
      ({
        category: row.category,
        received: 0,
        issued: 0,
        txn_count: 0,
      } satisfies ExtractCategoryTotal);
    agg.received += row.received;
    agg.issued += row.issued;
    agg.txn_count += 1;
    byCategory.set(row.category, agg);
  }

  const denom = starting + totalReceived;
  const wastePct = denom > 0 ? (wasteIssued / denom) * 100 : null;

  return {
    starting_balance: round5(starting),
    ending_balance: round5(ending),
    total_received: round5(totalReceived),
    total_issued: round5(totalIssued),
    waste_issued: round5(wasteIssued),
    waste_pct: wastePct === null ? null : Number(wastePct.toFixed(2)),
    txn_count: windowRows.length,
    first_date: windowRows[0]?.txn_date ?? null,
    last_date: windowRows[windowRows.length - 1]?.txn_date ?? null,
    category_totals: [...byCategory.values()].sort(
      (a, b) => b.issued + b.received - (a.issued + a.received),
    ),
  };
}

function round5(value: number): number {
  return Number(value.toFixed(5));
}
