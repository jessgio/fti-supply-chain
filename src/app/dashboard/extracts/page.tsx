"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FlaskConical,
  Search,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/dashboard/page-shell";
import { ExtractEntryForm } from "@/components/extracts/extract-entry-form";
import { formatNumber } from "@/lib/utils";
import type { ExtractSortKey, ExtractSummary } from "@/types/database";

type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  columnKey,
  activeKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  columnKey: ExtractSortKey;
  activeKey: ExtractSortKey;
  sortDir: SortDir;
  onSort: (key: ExtractSortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === columnKey;
  return (
    <th className="py-2 pr-4">
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

function wastePctClass(pct: number | null): string {
  if (pct === null) return "text-stone-400";
  if (pct >= 10) return "font-semibold text-rose-700";
  if (pct >= 5) return "font-medium text-amber-700";
  return "text-stone-700";
}

export default function ExtractsPage() {
  const [extracts, setExtracts] = useState<ExtractSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearchInputDebounced] = useState("");
  const [sortKey, setSortKey] = useState<ExtractSortKey>("item_no");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchInputDebounced(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadExtracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("sort", sortKey);
      params.set("sort_dir", sortDir);
      const res = await fetch(`/api/extracts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load extracts");
      setExtracts(data.extracts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search, sortKey, sortDir]);

  useEffect(() => {
    loadExtracts();
  }, [loadExtracts]);

  const summary = useMemo(() => {
    const totalIn = extracts.reduce((s, e) => s + e.total_received, 0);
    const totalWaste = extracts.reduce((s, e) => s + e.waste_issued, 0);
    const totalOpening = extracts.reduce((s, e) => s + e.starting_balance, 0);
    const denom = totalOpening + totalIn;
    return {
      count: extracts.length,
      totalIn,
      totalWaste,
      wastePct: denom > 0 ? (totalWaste / denom) * 100 : null,
    };
  }, [extracts]);

  function handleSort(key: ExtractSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "item_no" || key === "manufacturer_name" ? "asc" : "desc");
    }
  }

  return (
    <PageShell wide>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-stone-900">
          <FlaskConical className="h-6 w-6 text-emerald-700" />
          Extracts
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Track extract usage from manufacturer ledgers. Record inbound and
          outbound movements by category so you can monitor waste per extract.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Extracts tracked" value={formatNumber(summary.count)} />
        <StatCard
          label="Total inbound (kg)"
          value={formatNumber(summary.totalIn, 2)}
          tone="success"
        />
        <StatCard
          label="Total waste (kg)"
          value={formatNumber(summary.totalWaste, 2)}
          tone="danger"
        />
        <StatCard
          label="Overall waste %"
          value={
            summary.wastePct === null
              ? "—"
              : `${summary.wastePct.toFixed(2)}%`
          }
          tone={
            summary.wastePct !== null && summary.wastePct >= 5
              ? "danger"
              : "default"
          }
        />
      </div>

      <ExtractEntryForm onCommitted={loadExtracts} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Extract ledger summary</CardTitle>
          <CardDescription>
            Search by item number or extract name. Click an extract for the
            full ledger, date-range balances, and category breakdown. The list
            follows the Extract Catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              className="pl-9"
              placeholder="Search item no or extract name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          {loading ? (
            <p className="text-sm text-stone-500">Loading extracts…</p>
          ) : extracts.length === 0 ? (
            <p className="text-sm text-stone-500">
              No extracts in the catalog yet. Add items in the{" "}
              <Link
                href="/dashboard/extract-inbound-delivery-notes/codes"
                className="text-emerald-700 hover:underline"
              >
                Extract Catalog
              </Link>
              , then enter movements above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <SortableHeader
                      label="Item No"
                      columnKey="item_no"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Manufacturer name"
                      columnKey="manufacturer_name"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Balance"
                      columnKey="ending_balance"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Inbound"
                      columnKey="total_received"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Outbound"
                      columnKey="total_issued"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Waste %"
                      columnKey="waste_pct"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Rows"
                      columnKey="txn_count"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Last activity"
                      columnKey="last_date"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {extracts.map((ex) => (
                    <tr
                      key={ex.id}
                      className="border-b border-stone-100 hover:bg-stone-50"
                    >
                      <td className="py-2 pr-4">
                        <Link
                          href={`/dashboard/extracts/${ex.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {ex.item_no}
                        </Link>
                      </td>
                      <td className="max-w-xs truncate py-2 pr-4 text-stone-700">
                        {ex.manufacturer_name ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-stone-800">
                        {formatNumber(ex.ending_balance, 3)}
                      </td>
                      <td className="py-2 pr-4 text-emerald-700">
                        {formatNumber(ex.total_received, 3)}
                      </td>
                      <td className="py-2 pr-4 text-stone-700">
                        {formatNumber(ex.total_issued, 3)}
                      </td>
                      <td className={`py-2 pr-4 ${wastePctClass(ex.waste_pct)}`}>
                        {ex.waste_pct === null
                          ? "—"
                          : `${ex.waste_pct.toFixed(2)}%`}
                      </td>
                      <td className="py-2 pr-4 text-stone-600">
                        {ex.txn_count}
                      </td>
                      <td className="py-2 pr-4 text-stone-600">
                        {ex.last_date ?? "—"}
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
