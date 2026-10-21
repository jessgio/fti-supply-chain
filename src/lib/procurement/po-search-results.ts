import type {
  LarkApprovalStatus,
  LarkPaymentPlanScope,
  PoStatus,
  PurchaseOrder,
  PurchaseOrderLine,
} from "@/types/database";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import {
  computePoPaymentSummary,
  type PaymentFulfillmentStatus,
} from "@/lib/procurement/po-payment-status";
import {
  classifyPoLineProductType,
  distinctProductTypes,
  PO_LINE_PRODUCT_TYPE_LABELS,
  type PoLineProductType,
} from "@/lib/procurement/po-product-type";
import {
  isActivePurchaseOrder,
} from "@/lib/procurement/po-primary-groups";
import { STATUS_FLOW } from "@/lib/procurement/po-status";

export interface PoSearchSkuMeta {
  id: string;
  is_packaging?: boolean | null;
  is_extract?: boolean | null;
}

export interface PoSearchLineView {
  id: string;
  skuCode: string;
  skuName: string | null;
  productType: PoLineProductType;
  qty: number;
  unitPrice: number | null;
  lineValue: number;
  matched: boolean;
}

export interface PoSearchRowView {
  id: string;
  poNumber: string;
  orderDate: string | null;
  productTypes: PoLineProductType[];
  supplierName: string | null;
  qty: number;
  unitPrice: number | null;
  unitPriceVaries: boolean;
  otherCosts: number;
  vat: number;
  vatPct: number;
  total: number;
  downPaymentPct: number;
  balancePct: number;
  lastInboundDate: string | null;
  status: PoStatus;
  /** Null when payments were not loaded with the purchase order. */
  paymentStatus: PaymentFulfillmentStatus | null;
  /** Paid or overpaid. Null when payment status is unknown. */
  fullyPaid: boolean | null;
  currency: string;
  lines: PoSearchLineView[];
  /** Linked Lark AP forms, newest first. Empty when none were submitted. */
  apForms: PoApFormView[];
}

export interface PoApFormView {
  id: string;
  serialNumber: string | null;
  status: LarkApprovalStatus | null;
  paymentScope: LarkPaymentPlanScope | null;
  submittedAt: string | null;
}

/** AP forms to show for a purchase order, including a legacy single-form badge. */
export function apFormsFromPurchaseOrder(po: PurchaseOrder): PoApFormView[] {
  if (po.lark_submissions) {
    return [...po.lark_submissions]
      .sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""))
      .map((sub) => ({
        id: sub.id,
        serialNumber: sub.lark_serial_number,
        status: sub.lark_approval_status,
        paymentScope: sub.payment_scope,
        submittedAt: sub.submitted_at || null,
      }));
  }
  if (!po.lark_instance_code) return [];
  return [
    {
      id: po.lark_instance_code,
      serialNumber: po.lark_serial_number ?? null,
      status: po.lark_approval_status ?? null,
      paymentScope: null,
      submittedAt: po.lark_submitted_at ?? null,
    },
  ];
}

/** Purchase orders that belong on the selected procurement status tab. */
export function purchaseOrdersForStatusTab<T extends { status: PoStatus }>(
  pos: readonly T[],
  statusFilter: PoStatus | "",
): T[] {
  if (statusFilter) return pos.filter((po) => po.status === statusFilter);
  return pos.filter((po) => isActivePurchaseOrder(po));
}

function lineMatchesQuery(line: PurchaseOrderLine, query: string): boolean {
  if (!query) return false;
  return (
    (line.sku_code ?? "").toLowerCase().includes(query) ||
    (line.sku_name ?? "").toLowerCase().includes(query)
  );
}

function lineView(
  line: PurchaseOrderLine,
  skuById: Map<string, PoSearchSkuMeta>,
  query: string,
): PoSearchLineView {
  const sku = skuById.get(line.sku_id);
  const qty = line.qty_ordered;
  const unitPrice = line.unit_cost == null ? null : Number(line.unit_cost);
  return {
    id: line.id,
    skuCode: line.sku_code?.trim() || "—",
    skuName: line.sku_name?.trim() || null,
    productType: classifyPoLineProductType({
      skuCode: line.sku_code,
      skuName: line.sku_name,
      isPackaging: sku?.is_packaging,
      isExtract: sku?.is_extract,
    }),
    qty,
    unitPrice,
    lineValue: (unitPrice ?? 0) * qty,
    matched: lineMatchesQuery(line, query),
  };
}

export function buildPoSearchRow(
  po: PurchaseOrder,
  skuById: Map<string, PoSearchSkuMeta>,
  query: string,
): PoSearchRowView {
  const lines = (po.lines ?? []).map((line) => lineView(line, skuById, query));
  const totals = computePoInvoiceTotals(po);
  const prices = lines
    .map((line) => line.unitPrice)
    .filter((price): price is number => price != null);
  const uniquePrices = new Set(prices);
  const downPaymentPct = Number(po.down_payment_pct ?? 0);
  const paymentStatus =
    po.payments == null ? null : computePoPaymentSummary(po).overallStatus;
  return {
    id: po.id,
    poNumber: po.po_number,
    orderDate: po.order_date,
    productTypes: distinctProductTypes(lines.map((line) => line.productType)),
    supplierName: po.supplier_name?.trim() || null,
    qty: lines.reduce((sum, line) => sum + line.qty, 0),
    unitPrice: uniquePrices.size === 1 ? [...uniquePrices][0]! : null,
    unitPriceVaries: uniquePrices.size > 1,
    otherCosts: totals.otherCharges,
    vat: totals.tax,
    vatPct: totals.taxPct,
    total: totals.invoiceTotal,
    downPaymentPct,
    balancePct: Math.max(0, 100 - downPaymentPct),
    lastInboundDate: po.last_inbound_date?.trim() || null,
    status: po.status,
    paymentStatus,
    fullyPaid:
      paymentStatus == null
        ? null
        : paymentStatus === "paid" || paymentStatus === "overpaid",
    currency: po.currency || "IDR",
    lines,
    apForms: apFormsFromPurchaseOrder(po),
  };
}

/** Every matching purchase order, ignoring the status tab. */
export function buildPoSearchRows(
  purchaseOrders: readonly PurchaseOrder[],
  skus: readonly PoSearchSkuMeta[],
  query: string,
): PoSearchRowView[] {
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const needle = query.trim().toLowerCase();
  return purchaseOrders.map((po) => buildPoSearchRow(po, skuById, needle));
}

export type PoSearchSortKey =
  | "poNumber"
  | "orderDate"
  | "type"
  | "supplier"
  | "skus"
  | "qty"
  | "unitPrice"
  | "otherCosts"
  | "vat"
  | "total"
  | "paymentTerms"
  | "lastInbound"
  | "paid"
  | "apForm"
  | "status";

export type PoSearchSortDir = "asc" | "desc";

export type PoSearchPaidFilter = "" | "paid" | "unpaid";

export interface PoSearchFilters {
  /** Order-date month, `YYYY-MM`. */
  month: string;
  /** Inclusive order-date start, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive order-date end, `YYYY-MM-DD`. */
  to: string;
  supplier: string;
  productType: PoLineProductType | "";
  status: PoStatus | "";
  paid: PoSearchPaidFilter;
}

export const EMPTY_PO_SEARCH_FILTERS: PoSearchFilters = {
  month: "",
  from: "",
  to: "",
  supplier: "",
  productType: "",
  status: "",
  paid: "",
};

const TEXT_SORT_KEYS = new Set<PoSearchSortKey>([
  "poNumber",
  "type",
  "supplier",
  "skus",
  "status",
]);

const STATUS_RANK = new Map<PoStatus, number>(
  STATUS_FLOW.concat("cancelled").map((status, index) => [status, index]),
);

const PAID_RANK: Record<PaymentFulfillmentStatus, number> = {
  underpaid: 0,
  paid: 1,
  overpaid: 2,
};

/** Lower rank is the form that still needs attention. */
const AP_STATUS_RANK: Record<LarkApprovalStatus, number> = {
  PENDING: 0,
  REJECTED: 1,
  CANCELED: 2,
  DELETED: 3,
  APPROVED: 4,
};

export function defaultPoSearchSortDir(key: PoSearchSortKey): PoSearchSortDir {
  if (key === "apForm") return "asc";
  return TEXT_SORT_KEYS.has(key) ? "asc" : "desc";
}

export function poSearchFiltersActive(filters: PoSearchFilters): boolean {
  return Object.values(filters).some((value) => value !== "");
}

function orderDay(value: string | null): string | null {
  const day = value?.trim().slice(0, 10) ?? "";
  return day ? day : null;
}

export function filterPoSearchRows(
  rows: readonly PoSearchRowView[],
  filters: PoSearchFilters,
): PoSearchRowView[] {
  const month = filters.month.trim();
  const from = filters.from.trim();
  const to = filters.to.trim();
  const supplier = filters.supplier.trim();
  const needsDate = Boolean(month || from || to);

  return rows.filter((row) => {
    const day = orderDay(row.orderDate);
    if (needsDate && !day) return false;
    if (month && !day!.startsWith(month)) return false;
    if (from && day! < from) return false;
    if (to && day! > to) return false;
    if (supplier && (row.supplierName ?? "") !== supplier) return false;
    if (filters.productType && !row.productTypes.includes(filters.productType)) {
      return false;
    }
    if (filters.status && row.status !== filters.status) return false;
    if (filters.paid === "paid" && row.fullyPaid !== true) return false;
    if (filters.paid === "unpaid" && row.fullyPaid !== false) return false;
    return true;
  });
}

function weightedUnitPrice(row: PoSearchRowView): number | null {
  let qty = 0;
  let amount = 0;
  for (const line of row.lines) {
    if (line.unitPrice == null || !(line.qty > 0)) continue;
    qty += line.qty;
    amount += line.qty * line.unitPrice;
  }
  if (qty > 0) return amount / qty;
  return row.unitPrice;
}

function apFormSortRank(row: PoSearchRowView): number | null {
  if (row.apForms.length === 0) return null;
  let rank = AP_STATUS_RANK.APPROVED + 1;
  for (const form of row.apForms) {
    const next = form.status == null ? rank : AP_STATUS_RANK[form.status];
    if (next < rank) rank = next;
  }
  return rank;
}

function skuSortKey(row: PoSearchRowView): string | null {
  const codes = row.lines
    .map((line) => line.skuCode.trim())
    .filter((code) => code && code !== "—");
  return codes.length > 0 ? codes.join("\n").toLowerCase() : null;
}

function sortValue(row: PoSearchRowView, key: PoSearchSortKey): string | number | null {
  switch (key) {
    case "poNumber":
      return row.poNumber.trim().toLowerCase() || null;
    case "orderDate":
      return orderDay(row.orderDate);
    case "type":
      return row.productTypes.length > 0
        ? row.productTypes.map((type) => PO_LINE_PRODUCT_TYPE_LABELS[type]).join(", ")
        : null;
    case "supplier":
      return row.supplierName?.trim().toLowerCase() || null;
    case "skus":
      return skuSortKey(row);
    case "qty":
      return row.qty;
    case "unitPrice":
      return weightedUnitPrice(row);
    case "otherCosts":
      return row.otherCosts;
    case "vat":
      return row.vat;
    case "total":
      return row.total;
    case "paymentTerms":
      return row.downPaymentPct;
    case "lastInbound":
      return orderDay(row.lastInboundDate);
    case "paid":
      return row.paymentStatus == null ? null : PAID_RANK[row.paymentStatus];
    case "apForm":
      return apFormSortRank(row);
    case "status":
      return STATUS_RANK.get(row.status) ?? null;
  }
}

function compareNullable(
  a: string | number | null,
  b: string | number | null,
  dir: PoSearchSortDir,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const factor = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
  return String(a).localeCompare(String(b)) * factor;
}

export function sortPoSearchRows(
  rows: readonly PoSearchRowView[],
  key: PoSearchSortKey,
  dir: PoSearchSortDir,
): PoSearchRowView[] {
  return [...rows].sort((a, b) => {
    const primary = compareNullable(sortValue(a, key), sortValue(b, key), dir);
    if (primary !== 0) return primary;
    return a.poNumber.localeCompare(b.poNumber);
  });
}
