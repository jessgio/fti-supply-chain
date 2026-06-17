"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Search,
  Trash2,
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
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  EXTRACT_CATEGORIES,
  EXTRACT_CATEGORY_LABELS,
  EXTRACT_CATEGORY_STYLES,
} from "@/lib/extracts/categories";
import { cn, formatNumber } from "@/lib/utils";
import type {
  ExtractCategory,
  ExtractDetail,
  ExtractTxnSortKey,
} from "@/types/database";

type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  columnKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  columnKey: ExtractTxnSortKey;
  activeKey: ExtractTxnSortKey;
  sortDir: SortDir;
  onSort: (key: ExtractTxnSortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th className="py-2 pr-4">
      <button
        type="button"
        className="flex items-center gap-1 whitespace-nowrap font-medium text-stone-500 hover:text-stone-800"
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

export default function ExtractDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [detail, setDetail] = useState<ExtractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState<ExtractCategory | "">("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ExtractTxnSortKey>("txn_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deleting, setDeleting] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (category) qs.set("category", category);
      if (search.trim()) qs.set("search", search.trim());
      qs.set("sort", sortKey);
      qs.set("sort_dir", sortDir);
      const res = await fetch(`/api/extracts/${id}?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load extract");
      setDetail(data.detail as ExtractDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, from, to, category, search, sortKey, sortDir]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  function handleSort(key: ExtractTxnSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "txn_date" ? "asc" : "desc");
    }
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setCategory("");
    setSearch("");
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this extract and all of its ledger rows? This cannot be undone.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/extracts/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      router.push("/dashboard/extracts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  const unit = detail?.unit ?? "kg";
  const netChange = detail
    ? detail.ending_balance - detail.starting_balance
    : 0;
  const hasFilters = from || to || category || search.trim();

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/extracts"
            className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-4 w-4" /> All extracts
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            {detail?.item_no ?? "Extract"}
          </h1>
          {detail?.description && (
            <p className="mt-1 text-sm text-stone-600">{detail.description}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Date range</CardTitle>
          <CardDescription>
            Set a range to see the starting and ending balance, plus inbound and
            outbound totals within those dates. Leave blank for all time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                From
              </label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                To
              </label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Category
              </label>
              <Select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ExtractCategory | "")
                }
                className="w-52"
              >
                <option value="">All categories</option>
                {EXTRACT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXTRACT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  className="pl-9"
                  placeholder="Order no, lot, FROM/TO, remark…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={`Starting balance (${unit})`}
          value={formatNumber(detail?.starting_balance ?? 0, 3)}
        />
        <StatCard
          label={`Ending balance (${unit})`}
          value={formatNumber(detail?.ending_balance ?? 0, 3)}
          hint={`Net ${netChange >= 0 ? "+" : ""}${formatNumber(netChange, 3)}`}
        />
        <StatCard
          label={`Inbound (${unit})`}
          value={formatNumber(detail?.total_received ?? 0, 3)}
          tone="success"
        />
        <StatCard
          label={`Outbound (${unit})`}
          value={formatNumber(detail?.total_issued ?? 0, 3)}
        />
        <StatCard
          label="Waste %"
          value={
            detail?.waste_pct == null ? "—" : `${detail.waste_pct.toFixed(2)}%`
          }
          hint={`${formatNumber(detail?.waste_issued ?? 0, 3)} ${unit} wasted`}
          tone={
            detail?.waste_pct != null && detail.waste_pct >= 5
              ? "danger"
              : "default"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Category breakdown</CardTitle>
          <CardDescription>
            Inbound and outbound totals per category within the selected range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!detail || detail.category_totals.length === 0 ? (
            <p className="text-sm text-stone-500">No movements in range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 font-medium">Inbound</th>
                    <th className="py-2 pr-4 font-medium">Outbound</th>
                    <th className="py-2 pr-4 font-medium">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.category_totals.map((ct) => (
                    <tr key={ct.category} className="border-b border-stone-100">
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            EXTRACT_CATEGORY_STYLES[ct.category],
                          )}
                        >
                          {EXTRACT_CATEGORY_LABELS[ct.category]}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-emerald-700">
                        {ct.received ? formatNumber(ct.received, 3) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-stone-700">
                        {ct.issued ? formatNumber(ct.issued, 3) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-stone-600">
                        {ct.txn_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ledger</CardTitle>
          <CardDescription>
            {detail ? `${detail.transactions.length} rows` : ""} — sortable
            transaction history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-stone-500">Loading ledger…</p>
          ) : !detail || detail.transactions.length === 0 ? (
            <p className="text-sm text-stone-500">
              No transactions match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <SortableHeader
                      label="Date"
                      columnKey="txn_date"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Order No"
                      columnKey="order_no"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="py-2 pr-4 font-medium text-stone-500">TRAN</th>
                    <SortableHeader
                      label="FROM/TO"
                      columnKey="from_to"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Category"
                      columnKey="category"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="py-2 pr-4 font-medium text-stone-500">Lot</th>
                    <SortableHeader
                      label="Received"
                      columnKey="received"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Issued"
                      columnKey="issued"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Balance"
                      columnKey="balance"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="py-2 pr-4 font-medium text-stone-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.map((t) => (
                    <tr key={t.id} className="border-b border-stone-100">
                      <td className="whitespace-nowrap py-2 pr-4 text-stone-700">
                        {t.txn_date}
                      </td>
                      <td className="py-2 pr-4 text-stone-600">
                        {t.order_no ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-stone-500">
                        {t.tran_code ?? "—"}
                      </td>
                      <td className="max-w-[14rem] truncate py-2 pr-4 text-stone-700">
                        {t.from_to ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            EXTRACT_CATEGORY_STYLES[t.category],
                          )}
                        >
                          {EXTRACT_CATEGORY_LABELS[t.category]}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-stone-500">
                        {t.lot_no ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-emerald-700">
                        {t.received ? formatNumber(t.received, 3) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-stone-700">
                        {t.issued ? formatNumber(t.issued, 3) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-stone-800">
                        {t.balance == null ? "—" : formatNumber(t.balance, 3)}
                      </td>
                      <td className="py-2 pr-4 text-stone-500">
                        {t.status ?? "—"}
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
