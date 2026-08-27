"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Upload,
} from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { FORECAST_CSV_HEADERS, MONTHS } from "@/lib/sales-forecast/constants";
import { cn, formatDateShort } from "@/lib/utils";
import type {
  SopChannelGroup,
  SopForecastPayload,
  SopSkuRow,
  SopYearForecast,
} from "@/types/database";
import { createDraftsStore } from "./drafts-store";
import {
  CombinedSkuBody,
  EditableSkuBody,
  FranchiseBody,
  SavePlanButton,
  SkuMonthHeaders,
} from "./live-panels";
import { FREEZE, FREEZE_EDGE, freezeHead } from "./table-utils";
import { TargetsCard } from "./targets-card";
import { collectDirtyLines, draftsFromRows, type GroupDrafts } from "./view-helpers";

type SortKey =
  | "sku_code"
  | "franchise_name"
  | "current_stock"
  | "l3m_qty"
  | "shortfall_qty";
type SortDir = "asc" | "desc";
type TypeFilter = "single" | "bundle";
type ViewMode = "sku" | "franchise";
type Workspace = SopChannelGroup | "combined";

function franchiseLabel(row: SopSkuRow): string {
  return row.is_bundle ? "Bundles" : (row.franchise_name ?? "Unmapped");
}

function emptyTargetMap(): Record<number, string> {
  return Object.fromEntries(MONTHS.map((month) => [month, "0"]));
}

function targetsFromPayload(payload: SopForecastPayload): Record<number, string> {
  const next = emptyTargetMap();
  for (const t of payload.targets) {
    next[t.month] = String(t.target_net_sales_post_tax ?? 0);
  }
  return next;
}

export default function SalesForecastPage() {
  return (
    <Suspense
      fallback={
        <PageShell wide>
          <p className="text-sm text-stone-500">Loading sales forecast…</p>
        </PageShell>
      }
    >
      <SalesForecastClient />
    </Suspense>
  );
}

function SalesForecastClient() {
  const searchParams = useSearchParams();
  const initialGroup = searchParams.get("group");
  const focusSku = searchParams.get("sku")?.toUpperCase() ?? "";

  const [workspace, setWorkspace] = useState<Workspace>(
    initialGroup === "offline"
      ? "offline"
      : initialGroup === "combined"
        ? "combined"
        : "online",
  );
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearData, setYearData] = useState<SopYearForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(focusSku);
  const [typeFilter, setTypeFilter] = useState<TypeFilter[]>([]);
  const [franchiseFilter, setFranchiseFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("sku_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<ViewMode>("sku");
  const [draftSeed, setDraftSeed] = useState(0);
  const [targetDrafts, setTargetDrafts] = useState<
    Record<SopChannelGroup, Record<number, string>>
  >({
    online: emptyTargetMap(),
    offline: emptyTargetMap(),
  });
  const [mapOpen, setMapOpen] = useState(false);
  const [channelDraft, setChannelDraft] = useState<
    Record<string, SopChannelGroup | "">
  >({});
  const fileRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const draftsRef = useRef<Record<SopChannelGroup, GroupDrafts>>({
    online: { qty: {}, disc: {} },
    offline: { qty: {}, disc: {} },
  });
  const storeRef = useRef<ReturnType<typeof createDraftsStore> | null>(null);
  if (!storeRef.current) storeRef.current = createDraftsStore();
  const draftsStore = storeRef.current;

  const activeGroup: SopChannelGroup | null =
    workspace === "combined" ? null : workspace;
  const combined = workspace === "combined";

  const applyYearData = useCallback((next: SopYearForecast) => {
    setYearData(next);
    draftsRef.current = {
      online: draftsFromRows(next.groups.online.rows),
      offline: draftsFromRows(next.groups.offline.rows),
    };
    setTargetDrafts({
      online: targetsFromPayload(next.groups.online),
      offline: targetsFromPayload(next.groups.offline),
    });
    setChannelDraft(
      Object.fromEntries(next.channels.map((c) => [c.id, c.sop_group ?? ""])),
    );
    setDraftSeed((n) => n + 1);
    draftsStore.notifyNow();
  }, [draftsStore]);

  const applyGroupPayload = useCallback(
    (group: SopChannelGroup, next: SopForecastPayload) => {
      setYearData((prev) => {
        if (!prev) {
          return {
            year: next.year,
            current_month: next.current_month,
            read_only: next.read_only,
            unmapped_channel_count: next.unmapped_channel_count,
            channels: next.channels,
            groups: {
              online: group === "online" ? next : ({} as SopForecastPayload),
              offline: group === "offline" ? next : ({} as SopForecastPayload),
            },
          };
        }
        return {
          ...prev,
          unmapped_channel_count: next.unmapped_channel_count,
          channels: next.channels,
          groups: { ...prev.groups, [group]: next },
        };
      });
      draftsRef.current[group] = draftsFromRows(next.rows);
      setTargetDrafts((d) => ({ ...d, [group]: targetsFromPayload(next) }));
      setDraftSeed((n) => n + 1);
      draftsStore.notifyNow();
    },
    [draftsStore],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-forecast?year=${year}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load forecast");
      applyYearData(data as SopYearForecast);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forecast");
    } finally {
      setLoading(false);
    }
  }, [year, applyYearData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on year change
    void load();
  }, [load]);

  const payload = yearData
    ? combined
      ? yearData.groups.online
      : yearData.groups[workspace]
    : null;

  useEffect(() => {
    if (!payload || !focusSku) return;
    const row = payload.rows.find(
      (r) => r.sku_code.toUpperCase() === focusSku,
    );
    if (!row) return;
    rowRefs.current[row.sku_id]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [payload, focusSku, workspace]);

  const tableRows = useMemo(() => {
    if (!yearData) return [];
    if (combined) return yearData.groups.online.rows;
    return yearData.groups[workspace].rows;
  }, [yearData, workspace, combined]);

  const franchises = useMemo(() => {
    const names = new Set<string>();
    for (const row of tableRows) {
      if (row.is_bundle) names.add("Bundles");
      else if (row.franchise_name) names.add(row.franchise_name);
      else names.add("Unmapped");
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [tableRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = tableRows.filter((row) => {
      if (typeFilter.length === 1) {
        if (typeFilter[0] === "bundle" && !row.is_bundle) return false;
        if (typeFilter[0] === "single" && row.is_bundle) return false;
      }
      if (franchiseFilter.length > 0) {
        if (!franchiseFilter.includes(franchiseLabel(row))) return false;
      }
      if (!q) return true;
      return (
        row.sku_code.toLowerCase().includes(q) ||
        (row.name ?? "").toLowerCase().includes(q) ||
        (row.franchise_name ?? "").toLowerCase().includes(q)
      );
    });
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "sku_code":
          cmp = a.sku_code.localeCompare(b.sku_code);
          break;
        case "franchise_name":
          cmp = (a.franchise_name ?? (a.is_bundle ? "Bundles" : "")).localeCompare(
            b.franchise_name ?? (b.is_bundle ? "Bundles" : ""),
          );
          break;
        case "current_stock":
          cmp = a.current_stock - b.current_stock;
          break;
        case "l3m_qty":
          cmp = a.l3m_qty - b.l3m_qty;
          break;
        case "shortfall_qty":
          cmp = a.shortfall_qty - b.shortfall_qty;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tableRows, search, typeFilter, franchiseFilter, sortKey, sortDir]);

  const onDraft = useCallback(
    (skuId: string, month: number, field: "qty" | "disc", value: string) => {
      if (!activeGroup) return;
      const key = `${skuId}:${month}`;
      if (field === "qty") draftsRef.current[activeGroup].qty[key] = value;
      else draftsRef.current[activeGroup].disc[key] = value;
      draftsStore.notifyDebounced();
    },
    [activeGroup, draftsStore],
  );

  const getDrafts = useCallback(
    (skuId: string, month: number, field: "qty" | "disc") => {
      if (!activeGroup) return "";
      const key = `${skuId}:${month}`;
      const bucket =
        field === "qty"
          ? draftsRef.current[activeGroup].qty
          : draftsRef.current[activeGroup].disc;
      return bucket[key] ?? "";
    },
    [activeGroup],
  );

  const registerRow = useCallback(
    (skuId: string, el: HTMLTableRowElement | null) => {
      rowRefs.current[skuId] = el;
    },
    [],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function saveTargets() {
    if (!yearData || !activeGroup) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-forecast/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          group: activeGroup,
          targets: MONTHS.map((month) => ({
            month,
            target_net_sales_post_tax: Number(
              targetDrafts[activeGroup][month] ?? 0,
            ),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save targets");
      applyGroupPayload(activeGroup, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save targets");
    } finally {
      setSaving(false);
    }
  }

  async function saveLines() {
    if (!yearData || !activeGroup) return;
    const lines = collectDirtyLines(
      yearData.groups[activeGroup],
      draftsRef.current[activeGroup],
    );
    if (lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-forecast/lines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, group: activeGroup, lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save plan");
      applyGroupPayload(activeGroup, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  }

  async function saveChannelMap() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-forecast/channel-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: Object.entries(channelDraft).map(([id, sop_group]) => ({
            id,
            sop_group: sop_group === "" ? null : sop_group,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save channels");
      setMapOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save channels");
    } finally {
      setSaving(false);
    }
  }

  async function uploadCsv(file: File) {
    if (!activeGroup) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("year", String(year));
      form.set("group", activeGroup);
      form.set("file", file);
      const res = await fetch("/api/sales-forecast/uploads", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      applyGroupPayload(activeGroup, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteUpload(id: string) {
    if (!confirm("Delete this upload and clear its forecast quantities?")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-forecast/uploads/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete upload");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete upload");
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const sampleMonthNum =
      yearData && yearData.current_month >= 1 && yearData.current_month <= 12
        ? yearData.current_month
        : 1;
    const sampleMonth = `${year}-${String(sampleMonthNum).padStart(2, "0")}`;
    const csv = `${FORECAST_CSV_HEADERS.join(",")}\n${sampleMonth},SKU-001,10,100\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-forecast-${activeGroup ?? "combined"}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];
  const readOnly = yearData?.read_only ?? true;
  const uploads = activeGroup && yearData ? yearData.groups[activeGroup].uploads : [];

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Sales forecast
          </h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Online and offline monthly targets (post-tax IDR) plus SKU and bundle
            quantity plans. Historical L3M/L6M come from raw sales uploads.
            Planned net = qty × RSP × (1 − discount) ÷ 1.11.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
                {y < currentYear ? " (read-only)" : ""}
              </option>
            ))}
          </select>
          <Button
            variant={workspace === "online" ? "default" : "outline"}
            onClick={() => setWorkspace("online")}
          >
            Online
          </Button>
          <Button
            variant={workspace === "offline" ? "default" : "outline"}
            onClick={() => setWorkspace("offline")}
          >
            Offline
          </Button>
          <Button
            variant={workspace === "combined" ? "default" : "outline"}
            onClick={() => setWorkspace("combined")}
          >
            Combined
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {yearData?.read_only ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          {year} is read-only. Switch to {currentYear} or a future year to edit
          targets and plans.
        </p>
      ) : null}

      {combined ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          Combined is a read-only rollup of online and offline. Stock is counted
          once. Switch to Online or Offline to edit quantities.
        </p>
      ) : null}

      {yearData?.unmapped_channel_count ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {yearData.unmapped_channel_count} WMS channel
          {yearData.unmapped_channel_count === 1 ? "" : "s"} not mapped to Online
          or Offline.{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => setMapOpen(true)}
          >
            Map channels
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setMapOpen(true)}>
          Map WMS channels
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadTemplate}
          disabled={!yearData || combined}
        >
          <Download className="h-4 w-4" />
          CSV template
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!yearData || readOnly || saving || combined}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Upload CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadCsv(file);
          }}
        />
      </div>

      {!combined && uploads.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Forecast uploads</CardTitle>
            <CardDescription>
              Deleting a file clears the qty/discount rows it created.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {upload.filename}{" "}
                  <span className="text-stone-500">
                    · {upload.row_count} rows ·{" "}
                    {formatDateShort(upload.created_at)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={readOnly || saving}
                  onClick={() => void deleteUpload(upload.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <TargetsCard
        store={draftsStore}
        yearData={yearData}
        draftsRef={draftsRef}
        workspace={workspace}
        readOnly={readOnly}
        saving={saving}
        combined={combined}
        targetDrafts={targetDrafts}
        setTargetDrafts={setTargetDrafts}
        onSave={() => void saveTargets()}
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-stone-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>
                {viewMode === "sku" ? "SKU & bundle plan" : "Franchise rollup"}
              </CardTitle>
              <CardDescription>
                {viewMode === "sku"
                  ? combined
                    ? "Read-only sum of online and offline qty and post-tax. Stock is not doubled."
                    : "Month headers show the running total of entered values. Past months are actuals."
                  : "Read-only sum of SKU plans and history. Edit quantities on the SKU view."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={viewMode === "sku" ? "default" : "outline"}
                onClick={() => setViewMode("sku")}
              >
                SKU
              </Button>
              <Button
                size="sm"
                variant={viewMode === "franchise" ? "default" : "outline"}
                onClick={() => setViewMode("franchise")}
              >
                Franchise
              </Button>
              <Input
                className="h-8 w-44 text-xs"
                placeholder="Search SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <MultiSelect
                className="mt-0 min-w-[7rem]"
                options={[
                  { value: "single", label: "Single" },
                  { value: "bundle", label: "Bundle" },
                ]}
                value={typeFilter}
                onChange={setTypeFilter}
              />
              <MultiSelect
                className="mt-0 min-w-[8rem]"
                options={franchises.map((name) => ({
                  value: name,
                  label: name,
                }))}
                value={franchiseFilter}
                onChange={setFranchiseFilter}
                allLabel="All franchises"
              />
              {viewMode === "sku" && !combined ? (
                <SavePlanButton
                  store={draftsStore}
                  yearData={yearData}
                  activeGroup={activeGroup}
                  draftsRef={draftsRef}
                  readOnly={readOnly}
                  saving={saving}
                  onSave={() => void saveLines()}
                />
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-5 text-sm text-stone-500">Loading forecast…</p>
          ) : !yearData || filteredRows.length === 0 ? (
            <p className="p-5 text-sm text-stone-500">
              No SKUs match the current filters.
            </p>
          ) : viewMode === "franchise" ? (
            <div className="max-h-[min(70vh,calc(100vh-12rem))] overflow-auto">
              <table className="w-full min-w-[80rem] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-stone-500">
                    <SortTh
                      label="Franchise"
                      columnKey="franchise_name"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.id)}
                    />
                    <SortTh
                      label="Stock"
                      columnKey="current_stock"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.stock)}
                    />
                    <SortTh
                      label="L3M qty"
                      columnKey="l3m_qty"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.l3m)}
                    />
                    <th className={cn(freezeHead(FREEZE.l6m), FREEZE_EDGE)}>
                      L6M qty
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      SKUs
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      On order
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      OOS
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      L3M post-tax
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      L6M post-tax
                    </th>
                    <SkuMonthHeaders
                      store={draftsStore}
                      yearData={yearData}
                      draftsRef={draftsRef}
                      targetDrafts={targetDrafts}
                      workspace={workspace}
                      combined={combined}
                      compact
                    />
                  </tr>
                </thead>
                <FranchiseBody
                  store={draftsStore}
                  yearData={yearData}
                  draftsRef={draftsRef}
                  filteredRows={filteredRows}
                  workspace={workspace}
                  combined={combined}
                  sortKey={sortKey}
                  sortDir={sortDir}
                />
              </table>
            </div>
          ) : (
            <div className="max-h-[min(70vh,calc(100vh-12rem))] overflow-auto">
              <table className="w-full min-w-[90rem] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-stone-500">
                    <SortTh
                      label="SKU"
                      columnKey="sku_code"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.id)}
                    />
                    <SortTh
                      label="Stock"
                      columnKey="current_stock"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.stock)}
                    />
                    <SortTh
                      label="L3M qty"
                      columnKey="l3m_qty"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.l3m)}
                    />
                    <th className={cn(freezeHead(FREEZE.l6m), FREEZE_EDGE)}>
                      L6M qty
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      Type
                    </th>
                    <SortTh
                      label="Franchise"
                      columnKey="franchise_name"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      RSP
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      On order
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      OOS
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      L3M post-tax
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      L6M post-tax
                    </th>
                    <SkuMonthHeaders
                      store={draftsStore}
                      yearData={yearData}
                      draftsRef={draftsRef}
                      targetDrafts={targetDrafts}
                      workspace={workspace}
                      combined={combined}
                    />
                  </tr>
                </thead>
                {combined ? (
                  <CombinedSkuBody
                    store={draftsStore}
                    yearData={yearData}
                    draftsRef={draftsRef}
                    filteredOnlineRows={filteredRows}
                    focusSku={focusSku}
                    getDrafts={getDrafts}
                    onDraft={onDraft}
                    registerRow={registerRow}
                    draftSeed={draftSeed}
                  />
                ) : (
                  <EditableSkuBody
                    rows={filteredRows}
                    currentMonth={yearData.current_month}
                    readOnly={readOnly}
                    focusSku={focusSku}
                    getDrafts={getDrafts}
                    onDraft={onDraft}
                    registerRow={registerRow}
                    draftSeed={draftSeed}
                    workspace={workspace}
                  />
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title="Map WMS channels"
        description="Assign each sales-upload channel to Online or Offline. Unmapped channels are excluded from history."
      >
        <div className="max-h-80 space-y-2 overflow-auto">
          {(yearData?.channels ?? []).map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>{channel.name}</span>
              <select
                className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-xs"
                value={channelDraft[channel.id] ?? ""}
                onChange={(e) =>
                  setChannelDraft((d) => ({
                    ...d,
                    [channel.id]: e.target.value as SopChannelGroup | "",
                  }))
                }
              >
                <option value="">Unmapped</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          ))}
          {(yearData?.channels.length ?? 0) === 0 ? (
            <p className="text-sm text-stone-500">
              No sales channels yet. Upload sales first.
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMapOpen(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void saveChannelMap()}>
            Save mapping
          </Button>
        </div>
      </Dialog>
    </PageShell>
  );
}

function SortTh({
  label,
  columnKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  columnKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = active === columnKey;
  return (
    <th
      className={cn(
        "sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]",
        className,
      )}
    >
      <button
        type="button"
        className="flex items-center gap-1 whitespace-nowrap text-left hover:text-stone-800"
        onClick={() => onSort(columnKey)}
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
