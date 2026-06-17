"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/dashboard/page-shell";
import { formatNumber } from "@/lib/utils";
import type { StockBatch } from "@/types/database";
import type { StockBatchSortKey } from "@/lib/db/batches";

type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  columnKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  columnKey: StockBatchSortKey;
  activeKey: StockBatchSortKey;
  sortDir: SortDir;
  onSort: (key: StockBatchSortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th className="py-2 pr-4">
      <button
        type="button"
        className="flex items-center gap-1 whitespace-nowrap text-left font-medium text-stone-500 hover:text-stone-800"
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
        )}
      </button>
    </th>
  );
}

function expiryBadgeClass(expiryDate: string | null): string {
  if (!expiryDate) return "text-stone-500";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const days = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return "font-medium text-rose-700";
  if (days <= 30) return "font-medium text-amber-700";
  if (days <= 90) return "text-amber-700";
  return "text-stone-700";
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [batchInfoOnly, setBatchInfoOnly] = useState(false);
  const [sortKey, setSortKey] = useState<StockBatchSortKey>("expiry_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (batchCode.trim()) params.set("batch_code", batchCode.trim());
      if (expiryFrom) params.set("expiry_from", expiryFrom);
      if (expiryTo) params.set("expiry_to", expiryTo);
      if (batchInfoOnly) params.set("batch_info_only", "1");
      params.set("sort", sortKey);
      params.set("sort_dir", sortDir);

      const res = await fetch(`/api/batches?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load batches");
      setBatches(data.batches ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [
    search,
    batchCode,
    expiryFrom,
    expiryTo,
    batchInfoOnly,
    sortKey,
    sortDir,
  ]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const summary = useMemo(() => {
    const withExpiry = batches.filter((b) => b.expiry_date);
    const expiringSoon = withExpiry.filter((b) => {
      if (!b.expiry_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(`${b.expiry_date}T00:00:00`);
      const days = Math.ceil(
        (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      return days >= 0 && days <= 30;
    });
    const expired = withExpiry.filter((b) => {
      if (!b.expiry_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(`${b.expiry_date}T00:00:00`);
      return expiry < today;
    });
    return {
      total: batches.length,
      withBatchCode: batches.filter((b) => b.batch_code).length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
    };
  }, [batches]);

  function handleSort(key: StockBatchSortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "expiry_date" ? "asc" : "desc");
    }
  }

  function clearFilters() {
    setSearch("");
    setBatchCode("");
    setExpiryFrom("");
    setExpiryTo("");
    setBatchInfoOnly(false);
  }

  const hasFilters =
    search.trim() ||
    batchCode.trim() ||
    expiryFrom ||
    expiryTo ||
    batchInfoOnly;

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Stock batches
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Batch codes and expiry dates recorded when receiving purchase orders.
            Sorted by expiry date so the soonest dates appear first.
          </p>
        </div>
        <Link
          href="/dashboard/procurement"
          className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Procurement
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Receipts</CardDescription>
            <CardTitle className="text-2xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With batch code</CardDescription>
            <CardTitle className="text-2xl">{summary.withBatchCode}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expiring in 30 days</CardDescription>
            <CardTitle className="text-2xl text-amber-700">
              {summary.expiringSoon}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expired</CardDescription>
            <CardTitle className="text-2xl text-rose-700">
              {summary.expired}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-emerald-700" />
            Received batches
          </CardTitle>
          <CardDescription>
            Search by SKU, PO number, or batch code. Filter by expiry range.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  className="pl-9"
                  placeholder="SKU, PO, batch code…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="min-w-[10rem]">
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Batch code
              </label>
              <Input
                placeholder="Filter batch"
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Expiry from
              </label>
              <Input
                type="date"
                value={expiryFrom}
                onChange={(e) => setExpiryFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Expiry to
              </label>
              <Input
                type="date"
                value={expiryTo}
                onChange={(e) => setExpiryTo(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={batchInfoOnly}
                onChange={(e) => setBatchInfoOnly(e.target.checked)}
                className="rounded border-stone-300"
              />
              Batch/expiry only
            </label>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {loading ? (
            <p className="text-sm text-stone-500">Loading batches…</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-stone-500">
              No receipts match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <SortableHeader
                      label="SKU"
                      columnKey="sku_code"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Batch code"
                      columnKey="batch_code"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Expiry"
                      columnKey="expiry_date"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Qty"
                      columnKey="qty_received"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Location"
                      columnKey="location"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Received"
                      columnKey="received_date"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="py-2 font-medium text-stone-500">PO</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b border-stone-100">
                      <td className="py-2 pr-4">
                        <span className="font-medium text-stone-900">
                          {batch.sku_code}
                        </span>
                        {batch.sku_name && (
                          <span className="block text-xs text-stone-500">
                            {batch.sku_name}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-stone-700">
                        {batch.batch_code ?? "—"}
                      </td>
                      <td
                        className={`py-2 pr-4 ${expiryBadgeClass(batch.expiry_date)}`}
                      >
                        {batch.expiry_date ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-stone-700">
                        {formatNumber(batch.qty_received)}
                      </td>
                      <td className="py-2 pr-4 text-stone-600">
                        {batch.location}
                      </td>
                      <td className="py-2 pr-4 text-stone-600">
                        {batch.received_date}
                      </td>
                      <td className="py-2 text-stone-600">
                        {batch.po_number ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
