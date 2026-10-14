"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { formatPoMoney } from "@/lib/procurement/currencies";
import {
  PO_LINE_PRODUCT_TYPE_LABELS,
  PO_PRODUCT_TYPE_HINT,
  type PoLineProductType,
} from "@/lib/procurement/po-product-type";
import {
  buildPoSearchRows,
  type PoSearchLineView,
  type PoSearchRowView,
  type PoSearchSkuMeta,
} from "@/lib/procurement/po-search-results";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/procurement/po-status";
import type { PurchaseOrder } from "@/types/database";
import { formatDate, formatNumber } from "@/lib/utils";

const TYPE_STYLES: Record<PoLineProductType, string> = {
  primary_packaging: "bg-violet-100 text-violet-800",
  secondary_packaging: "bg-orange-100 text-orange-900",
  extract: "bg-emerald-100 text-emerald-800",
  mixing_filling: "bg-sky-100 text-sky-800",
};

const TH = "whitespace-nowrap py-2 pr-3 text-left text-xs font-medium text-stone-500";

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? formatNumber(qty) : formatNumber(qty, 4);
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  return `${formatNumber(rounded, decimals)}%`;
}

function ProductTypeBadges({ types }: { types: PoLineProductType[] }) {
  if (types.length === 0) {
    return <span className="text-stone-400">—</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {types.map((type) => (
        <Badge key={type} className={TYPE_STYLES[type]}>
          {PO_LINE_PRODUCT_TYPE_LABELS[type]}
        </Badge>
      ))}
    </div>
  );
}

function SkuList({ lines }: { lines: PoSearchLineView[] }) {
  if (lines.length === 0) return <span className="text-stone-400">—</span>;
  const visible = lines.slice(0, 4);
  const extra = lines.length - visible.length;
  return (
    <div className="min-w-[10rem] space-y-1">
      {visible.map((line) => (
        <div key={line.id} className={line.matched ? "rounded bg-amber-100/80 px-1" : undefined}>
          <span className="font-medium text-stone-800">{line.skuCode}</span>
          {line.skuName && line.skuName !== line.skuCode && (
            <span className="block text-xs text-stone-500">{line.skuName}</span>
          )}
        </div>
      ))}
      {extra > 0 && (
        <p className="text-xs text-stone-400">+{extra} more</p>
      )}
    </div>
  );
}

function moneyOrDash(value: number, currency: string): string {
  return value > 0 ? formatPoMoney(value, currency) : "—";
}

export function PoSearchResultsTable({
  purchaseOrders,
  skus,
  query,
}: {
  purchaseOrders: PurchaseOrder[];
  skus: PoSearchSkuMeta[];
  query: string;
}) {
  const trimmed = query.trim();
  const rows = useMemo(
    () => buildPoSearchRows(purchaseOrders, skus, trimmed),
    [purchaseOrders, skus, trimmed],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All matching purchase orders</CardTitle>
        <CardDescription>
          {rows.length} order{rows.length === 1 ? "" : "s"} match “{trimmed}”,
          including received and cancelled.
          {" "}
          {PO_PRODUCT_TYPE_HINT}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-stone-500">
            No purchase orders match “{trimmed}”.
          </p>
        ) : (
          <table className="w-full min-w-[92rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="w-8 py-2" />
                <th className={TH}>PO</th>
                <th className={TH}>Order date</th>
                <th className={TH}>Type</th>
                <th className={TH}>Supplier</th>
                <th className={TH}>SKUs</th>
                <th className={`${TH} text-right`} title="Quantity ordered">
                  Qty
                </th>
                <th className={`${TH} text-right`}>Unit price</th>
                <th className={`${TH} text-right`}>Other costs</th>
                <th className={`${TH} text-right`}>VAT</th>
                <th className={`${TH} text-right`}>Total</th>
                <th className={TH} title="Down payment and balance payment">
                  Payment terms
                </th>
                <th className={TH} title="Latest inbound receive or PO receipt date">
                  Last inbound
                </th>
                <th className="whitespace-nowrap py-2 text-left text-xs font-medium text-stone-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SearchResultRows
                  key={row.id}
                  row={row}
                  open={expanded.has(row.id)}
                  onToggle={() => toggle(row.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function SearchResultRows({
  row,
  open,
  onToggle,
}: {
  row: PoSearchRowView;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Fragment>
      <tr className="border-b border-stone-100 align-top">
        <td className="py-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label={open ? `Collapse ${row.poNumber}` : `Expand ${row.poNumber}`}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="py-2 pr-3">
          <PoHoverLink
            poId={row.id}
            poNumber={row.poNumber}
            lineItems={row.lines.map((line) => ({
              sku_code: line.skuCode,
              sku_name: line.skuName,
              qty_ordered: line.qty,
            }))}
          />
        </td>
        <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
          {formatDate(row.orderDate)}
        </td>
        <td className="py-2 pr-3">
          <ProductTypeBadges types={row.productTypes} />
        </td>
        <td className="py-2 pr-3">{row.supplierName ?? "—"}</td>
        <td className="py-2 pr-3">
          <SkuList lines={row.lines} />
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">{formatQty(row.qty)}</td>
        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
          {row.unitPrice != null
            ? formatPoMoney(row.unitPrice, row.currency)
            : row.unitPriceVaries
              ? "Varies"
              : "—"}
        </td>
        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
          {moneyOrDash(row.otherCosts, row.currency)}
        </td>
        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
          {row.vat > 0 ? (
            <>
              {formatPoMoney(row.vat, row.currency)}
              <span className="block text-xs text-stone-400">
                {formatPct(row.vatPct)}
              </span>
            </>
          ) : (
            "—"
          )}
        </td>
        <td className="whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums">
          {formatPoMoney(row.total, row.currency)}
        </td>
        <td className="whitespace-nowrap py-2 pr-3">
          <span className="tabular-nums">{formatPct(row.downPaymentPct)} DP</span>
          <span className="block text-xs tabular-nums text-stone-500">
            {formatPct(row.balancePct)} balance
          </span>
        </td>
        <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
          {formatDate(row.lastInboundDate)}
        </td>
        <td className="py-2">
          <Badge className={STATUS_STYLES[row.status]}>
            {STATUS_LABELS[row.status]}
          </Badge>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-stone-100 bg-stone-50/70">
          <td />
          <td colSpan={13} className="py-3 pr-3">
            {row.lines.length === 0 ? (
              <p className="text-xs text-stone-500">No line items on this purchase order.</p>
            ) : (
              <table className="w-full min-w-[48rem] text-left text-xs">
                <thead>
                  <tr className="text-stone-400">
                    <th className="py-1 pr-4 font-medium">Type</th>
                    <th className="py-1 pr-4 font-medium">SKU</th>
                    <th className="py-1 pr-4 text-right font-medium">Qty</th>
                    <th className="py-1 pr-4 text-right font-medium">Unit price</th>
                    <th className="py-1 text-right font-medium">Line value</th>
                  </tr>
                </thead>
                <tbody>
                  {row.lines.map((line) => (
                    <tr
                      key={line.id}
                      className={line.matched ? "bg-amber-100/70" : undefined}
                    >
                      <td className="py-1 pr-4">
                        <Badge className={TYPE_STYLES[line.productType]}>
                          {PO_LINE_PRODUCT_TYPE_LABELS[line.productType]}
                        </Badge>
                      </td>
                      <td className="py-1 pr-4">
                        <span className="font-medium text-stone-800">{line.skuCode}</span>
                        {line.skuName && line.skuName !== line.skuCode && (
                          <span className="block text-stone-500">{line.skuName}</span>
                        )}
                      </td>
                      <td className="py-1 pr-4 text-right tabular-nums">
                        {formatQty(line.qty)}
                      </td>
                      <td className="py-1 pr-4 text-right tabular-nums">
                        {line.unitPrice != null
                          ? formatPoMoney(line.unitPrice, row.currency)
                          : "—"}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatPoMoney(line.lineValue, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
