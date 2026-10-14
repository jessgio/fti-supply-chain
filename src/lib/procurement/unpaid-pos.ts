import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";
import { billableLineQty, computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import {
  computePoPaymentSummary,
  poCurrencyTolerance,
} from "@/lib/procurement/po-payment-status";

export type UnpaidPoDateKind = "expected" | "received";

export interface UnpaidPoLine {
  skuCode: string;
  skuName: string | null;
  /** Quantity included in the payable (ordered, or received when the PO is closed). */
  qty: number;
  unitCost: number | null;
}

export interface UnpaidPoRow {
  id: string;
  poNumber: string;
  supplierName: string | null;
  /** Expected delivery date, replaced by the inbound receive date when one exists. */
  date: string | null;
  dateKind: UnpaidPoDateKind | null;
  lines: UnpaidPoLine[];
  currency: string;
  /** VAT amount in the PO currency. Zero when the PO has no VAT. */
  vat: number;
  vatPct: number;
  totalPayables: number;
  paid: number;
  remaining: number;
  /** A payment is logged, but it does not cover the payable. */
  partiallyPaid: boolean;
}

export type UnpaidPoSortKey =
  | "poNumber"
  | "date"
  | "supplier"
  | "sku"
  | "qty"
  | "unitPrice"
  | "vat"
  | "total"
  | "paid"
  | "remaining";

export type UnpaidPoSortDir = "asc" | "desc";

const TEXT_SORT_KEYS = new Set<UnpaidPoSortKey>([
  "poNumber",
  "date",
  "supplier",
  "sku",
]);

/** First click sorts labels and dates A→Z, and amounts largest first. */
export function defaultUnpaidSortDir(key: UnpaidPoSortKey): UnpaidPoSortDir {
  return TEXT_SORT_KEYS.has(key) ? "asc" : "desc";
}

/** Latest YYYY-MM-DD inbound receive date, ignoring blanks. */
export function latestInboundReceiveDate(
  dates: Array<string | null | undefined>,
): string | null {
  let latest: string | null = null;
  for (const date of dates) {
    const value = date?.trim();
    if (!value) continue;
    if (!latest || value > latest) latest = value;
  }
  return latest;
}

function lineView(line: PurchaseOrderLine, po: PurchaseOrder): UnpaidPoLine {
  const skuCode = line.sku_code?.trim() || "—";
  const skuName = line.sku_name?.trim() || null;
  return {
    skuCode,
    skuName: skuName && skuName !== skuCode ? skuName : null,
    qty: billableLineQty(line, po),
    unitCost: line.unit_cost == null ? null : Number(line.unit_cost),
  };
}

function toUnpaidRow(
  po: PurchaseOrder,
  inboundReceiveDate: string | null,
): UnpaidPoRow | null {
  if (po.status === "cancelled") return null;
  if (po.payments == null) return null;

  const summary = computePoPaymentSummary(po);
  if (summary.overallStatus !== "underpaid") return null;

  const totals = computePoInvoiceTotals(po);
  const paid = summary.paidTotalPoCurrency;
  const totalPayables = summary.expectedTotal;
  const remaining = Math.max(0, totalPayables - paid);
  const received = inboundReceiveDate?.trim() || null;
  const expected = po.expected_date?.trim() || null;

  return {
    id: po.id,
    poNumber: po.po_number,
    supplierName: po.supplier_name?.trim() || null,
    date: received ?? expected ?? null,
    dateKind: received ? "received" : expected ? "expected" : null,
    lines: (po.lines ?? [])
      .map((line) => lineView(line, po))
      .sort((a, b) => a.skuCode.localeCompare(b.skuCode)),
    currency: summary.poCurrency,
    vat: totals.tax > 0 ? totals.tax : 0,
    vatPct: totals.tax > 0 ? totals.taxPct : 0,
    totalPayables,
    paid,
    remaining,
    partiallyPaid: paid > poCurrencyTolerance(summary.poCurrency),
  };
}

export function buildUnpaidPoRows(
  purchaseOrders: PurchaseOrder[],
  inboundReceiveDateByPoId: ReadonlyMap<string, string>,
): UnpaidPoRow[] {
  const rows: UnpaidPoRow[] = [];
  for (const po of purchaseOrders) {
    const row = toUnpaidRow(po, inboundReceiveDateByPoId.get(po.id) ?? null);
    if (row) rows.push(row);
  }
  return rows;
}

export function unpaidPoMatchesQuery(row: UnpaidPoRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.poNumber.toLowerCase().includes(q)) return true;
  if ((row.supplierName ?? "").toLowerCase().includes(q)) return true;
  return row.lines.some(
    (line) =>
      line.skuCode.toLowerCase().includes(q) ||
      (line.skuName ?? "").toLowerCase().includes(q),
  );
}

export function filterUnpaidPoRows(
  rows: readonly UnpaidPoRow[],
  query: string,
): UnpaidPoRow[] {
  if (!query.trim()) return [...rows];
  return rows.filter((row) => unpaidPoMatchesQuery(row, query));
}

function textKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed ? trimmed : null;
}

function skuSortKey(row: UnpaidPoRow): string | null {
  const codes = row.lines
    .map((line) => line.skuCode.trim())
    .filter((code) => code && code !== "—");
  return codes.length > 0 ? codes.join("\n").toLowerCase() : null;
}

function qtySortKey(row: UnpaidPoRow): number {
  return row.lines.reduce((sum, line) => sum + line.qty, 0);
}

/** Quantity-weighted average unit cost, so multi-SKU orders have one sort value. */
function unitPriceSortKey(row: UnpaidPoRow): number | null {
  let qty = 0;
  let amount = 0;
  for (const line of row.lines) {
    if (line.unitCost == null || !(line.qty > 0)) continue;
    qty += line.qty;
    amount += line.qty * line.unitCost;
  }
  if (qty > 0) return amount / qty;
  const priced = row.lines.find((line) => line.unitCost != null);
  return priced?.unitCost ?? null;
}

function sortValue(
  row: UnpaidPoRow,
  key: UnpaidPoSortKey,
): string | number | null {
  switch (key) {
    case "poNumber":
      return textKey(row.poNumber);
    case "date":
      return textKey(row.date);
    case "supplier":
      return textKey(row.supplierName);
    case "sku":
      return skuSortKey(row);
    case "qty":
      return qtySortKey(row);
    case "unitPrice":
      return unitPriceSortKey(row);
    case "vat":
      return row.vat;
    case "total":
      return row.totalPayables;
    case "paid":
      return row.paid;
    case "remaining":
      return row.remaining;
  }
}

function compareNullable(
  a: string | number | null,
  b: string | number | null,
  dir: UnpaidPoSortDir,
): number {
  const aEmpty = a == null;
  const bEmpty = b == null;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const factor = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
  return String(a).localeCompare(String(b)) * factor;
}

export function compareUnpaidPoRows(
  a: UnpaidPoRow,
  b: UnpaidPoRow,
  key: UnpaidPoSortKey,
  dir: UnpaidPoSortDir,
): number {
  const primary = compareNullable(sortValue(a, key), sortValue(b, key), dir);
  if (primary !== 0) return primary;
  return a.poNumber.localeCompare(b.poNumber);
}

export function sortUnpaidPoRows(
  rows: readonly UnpaidPoRow[],
  key: UnpaidPoSortKey,
  dir: UnpaidPoSortDir,
): UnpaidPoRow[] {
  return [...rows].sort((a, b) => compareUnpaidPoRows(a, b, key, dir));
}
