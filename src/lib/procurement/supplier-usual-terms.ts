import { formatPaymentPct } from "@/lib/procurement/committed-payment-amounts";

export type SupplierPoTermRow = {
  down_payment_pct: number | null;
  tax_pct: number | null;
  order_date: string | null;
  created_at: string | null;
};

export type UsualTerm = {
  value: number;
  count: number;
};

export type SupplierUsualTerms = {
  supplierId: string;
  poCount: number;
  downPayment: UsualTerm;
  vat: UsualTerm;
};

/** Round percents to one decimal so 30 and 30.0 group together. */
export function normalizePct(value: number): number {
  return Math.round(value * 10) / 10;
}

function recencyKey(row: SupplierPoTermRow): string {
  return `${row.order_date ?? ""}\t${row.created_at ?? ""}`;
}

function sortMostRecentFirst(rows: SupplierPoTermRow[]): SupplierPoTermRow[] {
  return rows.slice().sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)));
}

/**
 * Most common value. Ties go to the one that appears first in `values`
 * (callers should pass most-recent-first).
 */
export function pickUsualTerm(values: number[]): UsualTerm | null {
  if (values.length === 0) return null;

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best = values[0]!;
  let bestCount = 0;
  const seen = new Set<number>();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    const count = counts.get(value) ?? 0;
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, count: bestCount };
}

function finitePcts(rows: SupplierPoTermRow[], key: "down_payment_pct" | "tax_pct"): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const raw = Number(row[key]);
    if (!Number.isFinite(raw)) continue;
    values.push(normalizePct(raw));
  }
  return values;
}

/** Usual DP and VAT from non-cancelled PO headers, already recency-sorted or not. */
export function computeSupplierUsualTerms(
  supplierId: string,
  rows: SupplierPoTermRow[],
): SupplierUsualTerms | null {
  if (rows.length === 0) return null;

  const sorted = sortMostRecentFirst(rows);
  const downPayment = pickUsualTerm(finitePcts(sorted, "down_payment_pct"));
  const vat = pickUsualTerm(finitePcts(sorted, "tax_pct"));
  if (!downPayment || !vat) return null;

  return {
    supplierId,
    poCount: sorted.length,
    downPayment,
    vat,
  };
}

export function formatPctInput(value: number): string {
  return formatPaymentPct(value);
}

export function pctInputMatches(input: string, value: number): boolean {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return false;
  return normalizePct(parsed) === normalizePct(value);
}

function formatUsualPart(
  label: string,
  term: UsualTerm,
  poCount: number,
  showSplit: boolean,
): string {
  const pct = `${formatPaymentPct(term.value)}% ${label}`;
  if (!showSplit) return pct;
  return `${pct} (${term.count}/${poCount})`;
}

/** Compact historical summary, e.g. "Usual: 50% DP · 11% VAT (13 POs)". */
export function formatUsualTermsSummary(terms: SupplierUsualTerms): string {
  const dpSplit = terms.downPayment.count !== terms.poCount;
  const vatSplit = terms.vat.count !== terms.poCount;
  const dp = formatUsualPart("DP", terms.downPayment, terms.poCount, dpSplit);
  const vat = formatUsualPart("VAT", terms.vat, terms.poCount, vatSplit);
  if (dpSplit || vatSplit) {
    return `Usual: ${dp} · ${vat}`;
  }
  const poLabel = terms.poCount === 1 ? "PO" : "POs";
  return `Usual: ${dp} · ${vat} (${terms.poCount} ${poLabel})`;
}

export function formatUsualPctHint(term: UsualTerm, poCount: number): string {
  const pct = `${formatPaymentPct(term.value)}%`;
  if (term.count !== poCount) {
    return `Usual: ${pct} (${term.count}/${poCount} POs)`;
  }
  const poLabel = poCount === 1 ? "PO" : "POs";
  return `Usual: ${pct} (${poCount} ${poLabel})`;
}
