"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { formatPoMoney } from "@/lib/procurement/currencies";
import {
  defaultUnpaidSortDir,
  filterUnpaidPoRows,
  sortUnpaidPoRows,
  type UnpaidPoRow,
  type UnpaidPoSortDir,
  type UnpaidPoSortKey,
} from "@/lib/procurement/unpaid-pos";
import { formatDate, formatNumber } from "@/lib/utils";

const COLUMNS: Array<{
  key: UnpaidPoSortKey;
  label: string;
  align: "left" | "right";
  title?: string;
}> = [
  { key: "poNumber", label: "PO", align: "left" },
  {
    key: "date",
    label: "Delivery date",
    align: "left",
    title: "Expected delivery date, or the inbound receive date when goods have been received",
  },
  { key: "supplier", label: "Supplier", align: "left" },
  { key: "sku", label: "SKU", align: "left" },
  { key: "qty", label: "Qty", align: "right" },
  {
    key: "unitPrice",
    label: "Unit price",
    align: "right",
    title: "Sorts by the quantity-weighted average unit price",
  },
  { key: "vat", label: "VAT", align: "right" },
  { key: "total", label: "Total payables", align: "right" },
  { key: "paid", label: "Paid", align: "right" },
  { key: "remaining", label: "Remaining", align: "right" },
];

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? formatNumber(qty) : formatNumber(qty, 4);
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
  columnKey: UnpaidPoSortKey;
  activeKey: UnpaidPoSortKey;
  sortDir: UnpaidPoSortDir;
  onSort: (key: UnpaidPoSortKey) => void;
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
        className={`flex items-center gap-1 whitespace-nowrap font-medium text-stone-500 hover:text-stone-800 ${
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

function Money({
  value,
  currency,
  emphasize = false,
}: {
  value: number;
  currency: string;
  emphasize?: boolean;
}) {
  return (
    <span className={emphasize ? "font-medium text-amber-900" : undefined}>
      {formatPoMoney(value, currency)}
    </span>
  );
}

export function UnpaidPosTable({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<UnpaidPoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<UnpaidPoSortKey>("date");
  const [sortDir, setSortDir] = useState<UnpaidPoSortDir>("asc");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/procurement/unpaid");
        let data: { error?: string; rows?: UnpaidPoRow[] } = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(
            res.ok
              ? "Failed to parse unpaid purchase orders."
              : `Failed to load unpaid purchase orders (${res.status}).`,
          );
        }
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load unpaid purchase orders.");
        }
        if (!active) return;
        setRows(data.rows ?? []);
      } catch (err) {
        if (!active) return;
        setRows([]);
        setError(
          err instanceof Error ? err.message : "Failed to load unpaid purchase orders.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  function handleSort(key: UnpaidPoSortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultUnpaidSortDir(key));
  }

  const partialCount = useMemo(
    () => rows.filter((row) => row.partiallyPaid).length,
    [rows],
  );

  const visibleRows = useMemo(() => {
    return sortUnpaidPoRows(filterUnpaidPoRows(rows, query), sortKey, sortDir);
  }, [rows, query, sortKey, sortDir]);

  return (
    <UnpaidPosTableView
      rows={rows}
      visibleRows={visibleRows}
      partialCount={partialCount}
      loading={loading}
      error={error}
      query={query}
      onQueryChange={setQuery}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={handleSort}
    />
  );
}

export function UnpaidPosTableView({
  rows,
  visibleRows,
  partialCount,
  loading,
  error,
  query,
  onQueryChange,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: UnpaidPoRow[];
  visibleRows: UnpaidPoRow[];
  partialCount: number;
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  sortKey: UnpaidPoSortKey;
  sortDir: UnpaidPoSortDir;
  onSort: (key: UnpaidPoSortKey) => void;
}) {
  const trimmedQuery = query.trim();
  const needle = trimmedQuery.toLowerCase();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Unpaid purchase orders</CardTitle>
            <CardDescription>
              {loading
                ? "Loading purchase orders that still have a balance."
                : error
                  ? "Unpaid purchase orders could not be loaded."
                  : trimmedQuery
                    ? `${visibleRows.length} match${visibleRows.length === 1 ? "" : "es"} “${trimmedQuery}”.`
                    : rows.length === 0
                      ? "No purchase orders have an open balance."
                      : `${rows.length} purchase order${rows.length === 1 ? "" : "s"} with nothing logged or a balance still open${
                          partialCount > 0
                            ? `, including ${partialCount} partial payment${partialCount === 1 ? "" : "s"}`
                            : ""
                        }.`}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              className="pl-8 pr-8"
              placeholder="Search PO number, SKU, or supplier"
              aria-label="Search unpaid purchase orders by PO number, SKU, or supplier"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? (
          <p className="text-sm text-stone-500">Loading unpaid purchase orders…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-stone-500">
            Every purchase order is fully paid, or none have been raised yet.
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-stone-500">
            No unpaid purchase orders match “{trimmedQuery}”.
          </p>
        ) : (
          <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200">
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
            {visibleRows.map((row) => {
              const lineCount = Math.max(row.lines.length, 1);
              const lines = row.lines.length > 0 ? row.lines : [null];
              return (
                <tbody key={row.id}>
                  {lines.map((line, index) => {
                    const skuMatched =
                      needle.length > 0 &&
                      line != null &&
                      (line.skuCode.toLowerCase().includes(needle) ||
                        (line.skuName ?? "").toLowerCase().includes(needle));
                    return (
                      <tr
                        key={`${row.id}-${line?.skuCode ?? "empty"}-${index}`}
                        className={`border-b border-stone-100 align-top ${
                          row.partiallyPaid ? "bg-amber-50/70" : ""
                        }`}
                      >
                        {index === 0 && (
                          <td className="py-2 pr-3" rowSpan={lineCount}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <PoHoverLink
                                poId={row.id}
                                poNumber={row.poNumber}
                                lineItems={row.lines.map((item) => ({
                                  sku_code: item.skuCode,
                                  sku_name: item.skuName,
                                  qty_ordered: item.qty,
                                }))}
                              />
                              {row.partiallyPaid && (
                                <Badge className="bg-amber-100 text-amber-900">
                                  Partial
                                </Badge>
                              )}
                            </div>
                          </td>
                        )}
                        {index === 0 && (
                          <td className="py-2 pr-3 whitespace-nowrap" rowSpan={lineCount}>
                            <div className="tabular-nums text-stone-900">
                              {formatDate(row.date)}
                            </div>
                            {row.dateKind && (
                              <div
                                className={`text-xs ${
                                  row.dateKind === "received"
                                    ? "text-emerald-700"
                                    : "text-stone-500"
                                }`}
                              >
                                {row.dateKind === "received" ? "Received" : "Expected"}
                              </div>
                            )}
                          </td>
                        )}
                        {index === 0 && (
                          <td className="py-2 pr-3" rowSpan={lineCount}>
                            {row.supplierName ?? "—"}
                          </td>
                        )}
                        <td
                          className={`py-2 pr-3 ${skuMatched ? "bg-amber-100/80" : ""}`}
                        >
                          {line ? (
                            <>
                              <span className="font-medium text-stone-800">
                                {line.skuCode}
                              </span>
                              {line.skuName && (
                                <span className="block text-xs text-stone-500">
                                  {line.skuName}
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className={`py-2 pl-3 text-right tabular-nums ${
                            skuMatched ? "bg-amber-100/80" : ""
                          }`}
                        >
                          {line ? formatQty(line.qty) : "—"}
                        </td>
                        <td
                          className={`py-2 pl-3 text-right whitespace-nowrap tabular-nums ${
                            skuMatched ? "bg-amber-100/80" : ""
                          }`}
                        >
                          {line?.unitCost != null
                            ? formatPoMoney(line.unitCost, row.currency)
                            : "—"}
                        </td>
                        {index === 0 && (
                          <td
                            className="py-2 pl-3 text-right whitespace-nowrap tabular-nums"
                            rowSpan={lineCount}
                          >
                            {row.vat > 0 ? (
                              <>
                                <Money value={row.vat} currency={row.currency} />
                                <span className="block text-xs text-stone-500">
                                  {formatNumber(row.vatPct, 2)}%
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                        {index === 0 && (
                          <td
                            className="py-2 pl-3 text-right whitespace-nowrap tabular-nums"
                            rowSpan={lineCount}
                          >
                            <Money value={row.totalPayables} currency={row.currency} />
                          </td>
                        )}
                        {index === 0 && (
                          <td
                            className="py-2 pl-3 text-right whitespace-nowrap tabular-nums"
                            rowSpan={lineCount}
                          >
                            {row.partiallyPaid ? (
                              <>
                                <Money value={row.paid} currency={row.currency} />
                                <span className="block text-xs text-stone-500">paid</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                        {index === 0 && (
                          <td
                            className="py-2 pl-3 text-right whitespace-nowrap tabular-nums"
                            rowSpan={lineCount}
                          >
                            <Money
                              value={row.remaining}
                              currency={row.currency}
                              emphasize={row.partiallyPaid}
                            />
                            {row.partiallyPaid && (
                              <span className="block text-xs text-amber-800">
                                still due
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        )}
      </CardContent>
    </Card>
  );
}
