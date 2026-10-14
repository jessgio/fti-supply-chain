import type { PoStatus, PurchaseOrder, PurchaseOrderLine } from "@/types/database";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import {
  classifyPoLineProductType,
  distinctProductTypes,
  type PoLineProductType,
} from "@/lib/procurement/po-product-type";
import {
  isActivePurchaseOrder,
} from "@/lib/procurement/po-primary-groups";

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
  currency: string;
  lines: PoSearchLineView[];
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
    currency: po.currency || "IDR",
    lines,
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
