"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PoApFormStatusList } from "@/components/procurement/po-ap-form-status";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { formatPoMoney } from "@/lib/procurement/currencies";
import {
  PO_LINE_PRODUCT_TYPE_LABELS,
  PO_PRODUCT_TYPE_HINT,
  type PoLineProductType,
} from "@/lib/procurement/po-product-type";
import {
  buildPoSearchRows,
  defaultPoSearchSortDir,
  EMPTY_PO_SEARCH_FILTERS,
  filterPoSearchRows,
  poSearchFiltersActive,
  sortPoSearchRows,
  type PoSearchFilters,
  type PoSearchLineView,
  type PoSearchRowView,
  type PoSearchSkuMeta,
  type PoSearchSortDir,
  type PoSearchSortKey,
} from "@/lib/procurement/po-search-results";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
} from "@/lib/procurement/po-payment-status";
import { STATUS_FLOW, STATUS_LABELS, STATUS_STYLES } from "@/lib/procurement/po-status";
import type { PurchaseOrder } from "@/types/database";
import { formatDate, formatNumber } from "@/lib/utils";

const TYPE_STYLES: Record<PoLineProductType, string> = {
  primary_packaging: "bg-violet-100 text-violet-800",
  secondary_packaging: "bg-orange-100 text-orange-900",
  extract: "bg-emerald-100 text-emerald-800",
  mixing_filling: "bg-sky-100 text-sky-800",
};

const FIELD =
  "h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-800";

const COLUMNS: Array<{
  key: PoSearchSortKey;
  label: string;
  align: "left" | "right";
  title?: string;
}> = [
  { key: "poNumber", label: "PO", align: "left" },
  {
    key: "apForm",
    label: "AP Form",
    align: "left",
    title:
      "Each Lark AP Form and its approval status. Multiple submissions are listed separately.",
  },
  { key: "orderDate", label: "Order date", align: "left" },
  { key: "type", label: "Type", align: "left" },
  { key: "supplier", label: "Supplier", align: "left" },
  { key: "skus", label: "SKUs", align: "left" },
  { key: "qty", label: "Qty", align: "right", title: "Quantity ordered" },
  { key: "unitPrice", label: "Unit price", align: "right" },
  { key: "otherCosts", label: "Other costs", align: "right" },
  { key: "vat", label: "VAT", align: "right" },
  { key: "total", label: "Total", align: "right" },
  {
    key: "paymentTerms",
    label: "Payment terms",
    align: "left",
    title: "Each payment on the invoice. Sorts by the first payment percent.",
  },
  {
    key: "lastInbound",
    label: "Last inbound",
    align: "left",
    title: "Latest inbound receive or PO receipt date",
  },
  { key: "paid", label: "Paid", align: "left" },
  { key: "status", label: "Status", align: "left" },
];

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? formatNumber(qty) : formatNumber(qty, 4);
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  return `${formatNumber(rounded, decimals)}%`;
}

function formatPaymentTermShare(
  term:
    | { pct: number; amount: number; basis?: string; remainder?: boolean }
    | undefined,
  currency: string,
): string {
  if (!term) return "—";
  if (term.basis === "amount" || term.remainder) {
    return formatPoMoney(term.amount, currency);
  }
  return formatPct(term.pct);
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

function SortableHeader({
  label,
  columnKey,
  activeKey,
  sortDir,
  onSort,
  align,
  title,
}: {
  label: string;
  columnKey: PoSearchSortKey;
  activeKey: PoSearchSortKey;
  sortDir: PoSearchSortDir;
  onSort: (key: PoSearchSortKey) => void;
  align: "left" | "right";
  title?: string;
}) {
  const active = activeKey === columnKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={`py-2 ${align === "right" ? "pl-3" : "pr-3"}`}
      title={title}
    >
      <button
        type="button"
        className={`flex items-center gap-1 whitespace-nowrap text-xs font-medium text-stone-500 hover:text-stone-800 ${
          align === "right" ? "ml-auto" : ""
        }`}
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-stone-500">
      {label}
      {children}
    </label>
  );
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
  const [filters, setFilters] = useState<PoSearchFilters>(EMPTY_PO_SEARCH_FILTERS);
  const [sortKey, setSortKey] = useState<PoSearchSortKey>("orderDate");
  const [sortDir, setSortDir] = useState<PoSearchSortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const filtersActive = poSearchFiltersActive(filters);
  const visibleRows = useMemo(
    () => sortPoSearchRows(filterPoSearchRows(rows, filters), sortKey, sortDir),
    [rows, filters, sortKey, sortDir],
  );
  const suppliers = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.supplierName) names.add(row.supplierName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  function updateFilter<K extends keyof PoSearchFilters>(key: K, value: PoSearchFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function onSort(key: PoSearchSortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultPoSearchSortDir(key));
  }

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
          {filtersActive
            ? `${visibleRows.length} of ${rows.length} orders match “${trimmed}” after filters.`
            : `${rows.length} order${rows.length === 1 ? "" : "s"} match “${trimmed}”, including received and cancelled.`}
          {" "}
          {PO_PRODUCT_TYPE_HINT}
        </CardDescription>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <FilterField label="Month">
            <input
              type="month"
              className={FIELD}
              value={filters.month}
              aria-label="Filter by order month"
              onChange={(event) => updateFilter("month", event.target.value)}
            />
          </FilterField>
          <FilterField label="From">
            <input
              type="date"
              className={FIELD}
              value={filters.from}
              aria-label="Order date from"
              onChange={(event) => updateFilter("from", event.target.value)}
            />
          </FilterField>
          <FilterField label="To">
            <input
              type="date"
              className={FIELD}
              value={filters.to}
              aria-label="Order date to"
              onChange={(event) => updateFilter("to", event.target.value)}
            />
          </FilterField>
          <FilterField label="Supplier">
            <select
              className={FIELD}
              value={filters.supplier}
              aria-label="Filter by supplier"
              onChange={(event) => updateFilter("supplier", event.target.value)}
            >
              <option value="">All suppliers</option>
              {suppliers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Type">
            <select
              className={FIELD}
              value={filters.productType}
              aria-label="Filter by product type"
              onChange={(event) =>
                updateFilter("productType", event.target.value as PoSearchFilters["productType"])
              }
            >
              <option value="">All types</option>
              {(Object.keys(PO_LINE_PRODUCT_TYPE_LABELS) as PoLineProductType[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {PO_LINE_PRODUCT_TYPE_LABELS[value]}
                  </option>
                ),
              )}
            </select>
          </FilterField>
          <FilterField label="Order status">
            <select
              className={FIELD}
              value={filters.status}
              aria-label="Filter by order status"
              onChange={(event) =>
                updateFilter("status", event.target.value as PoSearchFilters["status"])
              }
            >
              <option value="">All statuses</option>
              {STATUS_FLOW.concat("cancelled").map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Payment">
            <select
              className={FIELD}
              value={filters.paid}
              aria-label="Filter by payment"
              onChange={(event) =>
                updateFilter("paid", event.target.value as PoSearchFilters["paid"])
              }
            >
              <option value="">Paid or unpaid</option>
              <option value="paid">Fully paid</option>
              <option value="unpaid">Not fully paid</option>
            </select>
          </FilterField>
          {filtersActive && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFilters(EMPTY_PO_SEARCH_FILTERS)}
            >
              Clear filters
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-stone-500">
            No purchase orders match “{trimmed}”.
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-stone-500">
            No purchase orders match these filters.
          </p>
        ) : (
          <table className="w-full min-w-[108rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="w-8 py-2" />
                {COLUMNS.map((column) => (
                  <SortableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    align={column.align}
                    title={column.title}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
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
        <td className="py-2 pr-3">
          <PoApFormStatusList forms={row.apForms} />
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
          {row.paymentTerms.length > 2 ? (
            <span
              className="tabular-nums"
              title={row.paymentTerms
                .map((term) => `${term.label} ${formatPaymentTermShare(term, row.currency)}`)
                .join(", ")}
            >
              {row.paymentTerms.map((term) => (
                <span key={term.label} className="block">
                  {formatPaymentTermShare(term, row.currency)} {term.label}
                </span>
              ))}
            </span>
          ) : (
            <>
              <span className="tabular-nums">
                {formatPaymentTermShare(row.paymentTerms[0], row.currency)} DP
              </span>
              <span className="block text-xs tabular-nums text-stone-500">
                {formatPaymentTermShare(row.paymentTerms[1], row.currency)} balance
              </span>
            </>
          )}
        </td>
        <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
          {formatDate(row.lastInboundDate)}
        </td>
        <td className="py-2 pr-3">
          {row.paymentStatus ? (
            <Badge className={PAYMENT_STATUS_STYLES[row.paymentStatus]}>
              {PAYMENT_STATUS_LABELS[row.paymentStatus]}
            </Badge>
          ) : (
            <span className="text-stone-400">—</span>
          )}
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
          <td colSpan={15} className="py-3 pr-3">
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
