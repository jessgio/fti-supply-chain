"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import {
  franchisesForRow,
  rowMatchesFranchiseFilter,
} from "@/lib/sales-forecast/franchise-rollup";
import { FORECAST_CSV_HEADERS, MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import { startOfMonthIso } from "@/lib/db/sku-retail-prices";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn, formatDateShort, parseNumericInput } from "@/lib/utils";
import type {
  SopChannelGroup,
  SopForecastPayload,
  SopSkuRow,
  SopYearForecast,
} from "@/types/database";
import { createDraftsStore, storeServerSnapshot } from "./drafts-store";
import {
  CombinedSkuBody,
  EditableSkuBody,
  FranchiseBody,
  InactiveMonthHeaders,
  InactiveSkuBody,
  SavePlanButton,
  SkuMonthHeaders,
} from "./live-panels";
import {
  calendarActiveMonth,
  FREEZE,
  FREEZE_EDGE,
  freezeHead,
  skuSearchRank,
  type ForecastSortKey,
} from "./table-utils";
import { PendingSkusCard } from "./pending-skus-card";
import { TargetsCard } from "./targets-card";
import {
  RspEffectiveDialog,
  type PendingRspChange,
} from "./rsp-effective-dialog";
import {
  activeMonthSortMetrics,
  collectDirtyLines,
  combinedActiveMonthSortMetrics,
  draftsFromRows,
  type GroupDrafts,
  mergeSavedPlanLines,
  mergeSavedTargets,
  unionChannelSkuRows,
} from "./view-helpers";

type SortKey = ForecastSortKey;
type SortDir = "asc" | "desc";
type TypeFilter = "single" | "bundle";
type NpdFilter = "npd" | "established";
type ViewMode = "sku" | "franchise";
type Workspace = SopChannelGroup | "combined";
type InactiveScope = SopChannelGroup | "both";

function emptyTargetMap(): Record<number, string> {
  return Object.fromEntries(MONTHS.map((month) => [month, "0"]));
}

function targetsFromPayload(
  payload: SopForecastPayload | null | undefined,
): Record<number, string> {
  const next = emptyTargetMap();
  for (const t of payload?.targets ?? []) {
    next[t.month] = String(t.target_net_sales_post_tax ?? 0);
  }
  return next;
}

function isForecastGroupPayload(value: unknown): value is SopForecastPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SopForecastPayload>;
  return Array.isArray(payload.rows) && Array.isArray(payload.targets);
}

function patchYearDataRetailPrice(
  prev: SopYearForecast,
  skuId: string,
  retailPrice: number | null,
  effectiveFrom?: string | null,
): SopYearForecast {
  const from = effectiveFrom ?? "2000-01-01";
  const now = new Date();
  const todayStart = startOfMonthIso(now.getFullYear(), now.getMonth() + 1);
  const mapRows = (rows: SopSkuRow[]) =>
    rows.map((row) => {
      if (row.sku_id !== skuId) return row;
      const rsp_by_month = { ...(row.rsp_by_month ?? {}) };
      if (retailPrice == null) {
        for (const month of MONTHS) rsp_by_month[month] = null;
        return { ...row, retail_price: null, rsp_by_month };
      }
      for (const month of MONTHS) {
        if (startOfMonthIso(prev.year, month) >= from) {
          rsp_by_month[month] = retailPrice;
        }
      }
      return {
        ...row,
        retail_price: from <= todayStart ? retailPrice : row.retail_price,
        rsp_by_month,
      };
    });
  const mapGroup = (group: SopForecastPayload): SopForecastPayload => ({
    ...group,
    rows: mapRows(group.rows),
    inactive_rows: mapRows(group.inactive_rows ?? []),
  });
  return {
    ...prev,
    groups: {
      online: mapGroup(prev.groups.online),
      offline: mapGroup(prev.groups.offline),
    },
  };
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
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState(focusSku);
  const debouncedSearch = useDebouncedValue(search, 250);
  const [typeFilter, setTypeFilter] = useState<TypeFilter[]>([]);
  const [npdFilter, setNpdFilter] = useState<NpdFilter[]>([]);
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
  const targetDraftsRef = useRef(targetDrafts);
  const [targetsPending, setTargetsPending] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [channelDraft, setChannelDraft] = useState<
    Record<string, SopChannelGroup | "">
  >({});
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [inactiveGroup, setInactiveGroup] = useState<InactiveScope>("online");
  const [inactiveDraft, setInactiveDraft] = useState<Set<string>>(new Set());
  const [inactiveSearch, setInactiveSearch] = useState("");
  const [pendingInactiveIds, setPendingInactiveIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingRsp, setPendingRsp] = useState<PendingRspChange | null>(null);
  const [savingRsp, setSavingRsp] = useState(false);
  const onlineFileRef = useRef<HTMLInputElement>(null);
  const offlineFileRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const draftsRef = useRef<Record<SopChannelGroup, GroupDrafts>>({
    online: { qty: {}, disc: {} },
    offline: { qty: {}, disc: {} },
  });
  const storeRef = useRef<ReturnType<typeof createDraftsStore> | null>(null);
  if (!storeRef.current) storeRef.current = createDraftsStore();
  const draftsStore = storeRef.current;
  const sortNeedsLiveDrafts =
    sortKey === "plan_qty" ||
    sortKey === "plan_pct" ||
    sortKey === "plan_contrib" ||
    sortKey === "l3m_qty_delta" ||
    sortKey === "l3m_net_delta";
  const subscribeLiveSort = useCallback(
    (onStoreChange: () => void) => {
      if (!sortNeedsLiveDrafts) return () => {};
      return draftsStore.subscribe(onStoreChange);
    },
    [draftsStore, sortNeedsLiveDrafts],
  );
  const draftVersion = useSyncExternalStore(
    subscribeLiveSort,
    draftsStore.getSnapshot,
    storeServerSnapshot,
  );

  const activeGroup: SopChannelGroup | null =
    workspace === "combined" ? null : workspace;
  const combined = workspace === "combined";

  const hasUnsavedPlanDrafts = useCallback(() => {
    if (!yearData || !activeGroup) return false;
    return (
      collectDirtyLines(
        yearData.groups[activeGroup],
        draftsRef.current[activeGroup],
      ).length > 0
    );
  }, [yearData, activeGroup]);

  const applyYearData = useCallback((next: SopYearForecast) => {
    setYearData(next);
    draftsRef.current = {
      online: draftsFromRows(next.groups?.online?.rows),
      offline: draftsFromRows(next.groups?.offline?.rows),
    };
    const nextTargets = {
      online: targetsFromPayload(next.groups.online),
      offline: targetsFromPayload(next.groups.offline),
    };
    targetDraftsRef.current = nextTargets;
    setTargetDrafts(nextTargets);
    setTargetsPending(false);
    setChannelDraft(
      Object.fromEntries(
        (next.channels ?? []).map((c) => [c.id, c.sop_group ?? ""]),
      ),
    );
    setDraftSeed((n) => n + 1);
    draftsStore.notifyNow();
  }, [draftsStore]);

  const applyGroupPayload = useCallback(
    (group: SopChannelGroup, next: SopForecastPayload) => {
      if (!isForecastGroupPayload(next)) {
        return;
      }
      setYearData((prev) => {
        if (!prev) {
          return {
            year: next.year,
            current_month: next.current_month,
            read_only: next.read_only,
            unmapped_channel_count: next.unmapped_channel_count,
            channels: next.channels,
            eligible_skus: [],
            inactive_sku_ids: {
              online: group === "online" ? next.inactive_sku_ids : [],
              offline: group === "offline" ? next.inactive_sku_ids : [],
            },
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
          eligible_skus: (() => {
            const seen = new Set(prev.eligible_skus.map((sku) => sku.sku_id));
            const extra = next.rows
              .filter((row) => !seen.has(row.sku_id))
              .map((row) => ({
                sku_id: row.sku_id,
                sku_code: row.sku_code,
                name: row.name,
                is_bundle: row.is_bundle,
                franchise_name: row.franchise_name,
              }));
            return extra.length === 0
              ? prev.eligible_skus
              : [...prev.eligible_skus, ...extra];
          })(),
          inactive_sku_ids: {
            ...prev.inactive_sku_ids,
            [group]: next.inactive_sku_ids,
          },
          groups: { ...prev.groups, [group]: next },
        };
      });
      draftsRef.current[group] = draftsFromRows(next.rows);
      const nextTargets = targetsFromPayload(next);
      targetDraftsRef.current = { ...targetDraftsRef.current, [group]: nextTargets };
      setTargetDrafts((d) => ({ ...d, [group]: nextTargets }));
      setTargetsPending(false);
      setDraftSeed((n) => n + 1);
      draftsStore.notifyNow();
    },
    [draftsStore],
  );

  function inactiveDraftForScope(
    scope: InactiveScope,
    data: SopYearForecast | null,
  ): Set<string> {
    if (!data) return new Set();
    if (scope === "both") {
      return new Set([
        ...data.inactive_sku_ids.online,
        ...data.inactive_sku_ids.offline,
      ]);
    }
    return new Set(data.inactive_sku_ids[scope] ?? []);
  }

  function openInactiveDialog() {
    const group: InactiveScope =
      workspace === "offline" ? "offline" : "online";
    setInactiveGroup(group);
    setInactiveDraft(inactiveDraftForScope(group, yearData));
    setInactiveSearch("");
    setInactiveOpen(true);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
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

  useEffect(() => {
    setPendingInactiveIds(new Set());
  }, [workspace, year]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedPlanDrafts()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedPlanDrafts]);

  const payload = yearData
    ? combined
      ? yearData.groups.online
      : yearData.groups[workspace]
    : null;
  const lagMonthLabel = MONTH_LABELS[(new Date().getMonth() + 11) % 12];
  const runRateHint =
    workspace === "offline"
      ? `Excl. ${lagMonthLabel} — offline sell-out usually lands 20–25 days after month end`
      : undefined;
  const onOrderHint =
    "Open PO qty and expected arrival. Bundles show extra complete sets inbound unlocks (buildable after on-hand + POs, minus what’s already on the shelf) and the last batch date that makes that extra possible.";

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
    if (combined) {
      return unionChannelSkuRows(
        yearData.groups.online.rows,
        yearData.groups.offline.rows,
      );
    }
    return yearData.groups[workspace].rows;
  }, [yearData, workspace, combined]);

  const inactiveTableRows = useMemo(() => {
    if (!yearData) return [];
    if (combined) {
      return unionChannelSkuRows(
        yearData.groups.online.inactive_rows ?? [],
        yearData.groups.offline.inactive_rows ?? [],
      );
    }
    return yearData.groups[workspace].inactive_rows ?? [];
  }, [yearData, workspace, combined]);

  const pendingTableRows = useMemo(() => {
    if (!yearData) return [];
    if (combined) {
      return [
        ...(yearData.groups.online.pending_skus ?? []),
        ...(yearData.groups.offline.pending_skus ?? []),
      ];
    }
    return yearData.groups[workspace].pending_skus ?? [];
  }, [yearData, workspace, combined]);

  const franchises = useMemo(() => {
    const names = new Set<string>();
    for (const row of tableRows) {
      for (const name of franchisesForRow(row)) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [tableRows]);

  const filterSkuRows = useCallback(
    (rows: typeof tableRows) => {
      const q = debouncedSearch.trim().toLowerCase();
      return rows.filter((row) => {
        if (typeFilter.length === 1) {
          if (typeFilter[0] === "bundle" && !row.is_bundle) return false;
          if (typeFilter[0] === "single" && row.is_bundle) return false;
        }
        if (npdFilter.length === 1) {
          if (npdFilter[0] === "npd" && !row.is_npd) return false;
          if (npdFilter[0] === "established" && row.is_npd) return false;
        }
        if (!rowMatchesFranchiseFilter(row, franchiseFilter)) return false;
        if (!q) return true;
        const franchiseHay = franchisesForRow(row).join(" ").toLowerCase();
        return (
          row.sku_code.toLowerCase().includes(q) ||
          (row.name ?? "").toLowerCase().includes(q) ||
          franchiseHay.includes(q)
        );
      });
    },
    [debouncedSearch, typeFilter, npdFilter, franchiseFilter],
  );

  const filteredRows = useMemo(() => {
    const rows = filterSkuRows(tableRows);
    const activeMonth = yearData ? calendarActiveMonth(yearData.year) : null;
    const onlineById = new Map(
      (yearData?.groups.online.rows ?? []).map((row) => [row.sku_id, row]),
    );
    const offlineById = new Map(
      (yearData?.groups.offline.rows ?? []).map((row) => [row.sku_id, row]),
    );
    const metricFor = (row: SopSkuRow) => {
      if (!yearData) {
        return {
          planQty: 0,
          planPostTax: 0,
          planPct: null as number | null,
          qtyDelta: 0,
          netDelta: 0,
        };
      }
      if (combined) {
        return combinedActiveMonthSortMetrics(
          onlineById.get(row.sku_id),
          offlineById.get(row.sku_id),
          activeMonth,
          yearData.current_month,
          yearData.read_only,
          draftsRef.current.online,
          draftsRef.current.offline,
        );
      }
      return activeMonthSortMetrics(
        row,
        activeMonth,
        yearData.current_month,
        yearData.read_only,
        activeGroup ? draftsRef.current[activeGroup] : null,
      );
    };
    return [...rows].sort((a, b) => {
      const q = debouncedSearch.trim().toLowerCase();
      const rankCmp = skuSearchRank(a.sku_code, q) - skuSearchRank(b.sku_code, q);
      if (rankCmp !== 0) return rankCmp;
      let cmp = 0;
      switch (sortKey) {
        case "sku_code":
          cmp = a.sku_code.localeCompare(b.sku_code);
          break;
        case "franchise_name":
          cmp = franchisesForRow(a)[0]!.localeCompare(franchisesForRow(b)[0]!);
          break;
        case "current_stock":
          cmp = a.current_stock - b.current_stock;
          break;
        case "on_order_qty":
          cmp = a.on_order_qty - b.on_order_qty;
          break;
        case "l3m_qty":
          cmp = a.l3m_qty - b.l3m_qty;
          break;
        case "shortfall_qty":
          cmp = a.shortfall_qty - b.shortfall_qty;
          break;
        case "plan_qty":
          cmp = metricFor(a).planQty - metricFor(b).planQty;
          break;
        case "plan_pct": {
          const aPct = metricFor(a).planPct;
          const bPct = metricFor(b).planPct;
          cmp = (aPct ?? Number.NEGATIVE_INFINITY) - (bPct ?? Number.NEGATIVE_INFINITY);
          break;
        }
        case "plan_contrib":
          cmp = metricFor(a).planPostTax - metricFor(b).planPostTax;
          break;
        case "l3m_qty_delta":
          cmp = metricFor(a).qtyDelta - metricFor(b).qtyDelta;
          break;
        case "l3m_net_delta":
          cmp = metricFor(a).netDelta - metricFor(b).netDelta;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [
    tableRows,
    filterSkuRows,
    sortKey,
    sortDir,
    yearData,
    combined,
    activeGroup,
    draftVersion,
    debouncedSearch,
  ]);

  const filteredInactiveRows = useMemo(() => {
    const rows = filterSkuRows(inactiveTableRows);
    return [...rows].sort((a, b) => a.sku_code.localeCompare(b.sku_code));
  }, [inactiveTableRows, filterSkuRows]);

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

  const onDraftSettle = useCallback(() => {
    draftsStore.notifyNow();
  }, [draftsStore]);

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

  const onSaveRsp = useCallback(
    async (
      skuId: string,
      retailPrice: number | null,
      effectiveFrom?: string,
    ) => {
      setError(null);
      const res = await fetch(`/api/skus/${skuId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retail_price: retailPrice,
          ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data.error === "string" ? data.error : "Failed to save RSP";
        setError(message);
        throw new Error(message);
      }
      const saved =
        data.sku?.retail_price == null
          ? null
          : Number(data.sku.retail_price);
      setYearData((prev) =>
        prev
          ? patchYearDataRetailPrice(prev, skuId, saved, effectiveFrom)
          : prev,
      );
      draftsStore.notifyNow();
    },
    [draftsStore],
  );

  const onChangeExistingRsp = useCallback(
    (skuId: string, skuCode: string, next: number) => {
      const current =
        yearData?.groups.online.rows.find((row) => row.sku_id === skuId)
          ?.retail_price ??
        yearData?.groups.offline.rows.find((row) => row.sku_id === skuId)
          ?.retail_price ??
        0;
      setPendingRsp({
        skuId,
        skuCode,
        current: current && current > 0 ? current : next,
        next,
      });
    },
    [yearData],
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
      setSortDir(key === "on_order_qty" ? "desc" : "asc");
    }
  }

  async function saveTargets() {
    if (!yearData || !activeGroup) return;
    const flushed = targetDraftsRef.current[activeGroup];
    const targets = MONTHS.map((month) => ({
      month,
      target_net_sales_post_tax: parseNumericInput(flushed[month]),
    }));
    setTargetDrafts(targetDraftsRef.current);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-forecast/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          group: activeGroup,
          targets,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save targets");
      const nextGroup = mergeSavedTargets(
        yearData.groups[activeGroup],
        targets,
      );
      const nextTargets = targetsFromPayload(nextGroup);
      targetDraftsRef.current = {
        ...targetDraftsRef.current,
        [activeGroup]: nextTargets,
      };
      setYearData((prev) =>
        prev
          ? {
              ...prev,
              groups: { ...prev.groups, [activeGroup]: nextGroup },
            }
          : prev,
      );
      setTargetDrafts(targetDraftsRef.current);
      setTargetsPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save targets");
    } finally {
      setSaving(false);
    }
  }

  async function saveLines() {
    if (!yearData || !activeGroup) return;
    draftsStore.notifyNow();
    const lines = collectDirtyLines(
      yearData.groups[activeGroup],
      draftsRef.current[activeGroup],
    );
    if (lines.length === 0) {
      setError("No plan changes to save.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-forecast/lines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, group: activeGroup, lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save plan");
      const nextGroup = mergeSavedPlanLines(
        yearData.groups[activeGroup],
        lines,
      );
      draftsRef.current[activeGroup] = draftsFromRows(nextGroup.rows);
      setYearData((prev) =>
        prev
          ? {
              ...prev,
              groups: { ...prev.groups, [activeGroup]: nextGroup },
            }
          : prev,
      );
      draftsStore.notifyNow();
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

  async function saveInactiveSkus() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-forecast/inactive-skus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          group: inactiveGroup,
          sku_ids: [...inactiveDraft],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save inactive SKUs");
      if (data.forecast) {
        applyYearData(data.forecast as SopYearForecast);
      } else {
        await load();
      }
      setInactiveOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save inactive SKUs",
      );
    } finally {
      setSaving(false);
    }
  }

  function togglePendingInactive(skuId: string) {
    setPendingInactiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  }

  async function savePendingInactive(scope: InactiveScope) {
    if (!yearData || yearData.read_only) return;
    if (pendingInactiveIds.size === 0) return;

    const n = pendingInactiveIds.size;
    const scopeLabel =
      scope === "both"
        ? "Online and Offline"
        : scope === "online"
          ? "Online"
          : "Offline";
    if (
      !confirm(
        `Mark ${n} SKU${n === 1 ? "" : "s"} inactive for ${scopeLabel}? They will leave that channel’s forecast table.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const groups: SopChannelGroup[] =
        scope === "both" ? ["online", "offline"] : [scope];
      let lastForecast: SopYearForecast | null = null;
      for (const group of groups) {
        const nextIds = [
          ...new Set([
            ...(yearData.inactive_sku_ids[group] ?? []),
            ...pendingInactiveIds,
          ]),
        ];
        const res = await fetch("/api/sales-forecast/inactive-skus", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, group, sku_ids: nextIds }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to mark SKUs inactive");
        }
        if (data.forecast) lastForecast = data.forecast as SopYearForecast;
      }
      if (lastForecast) applyYearData(lastForecast);
      else await load();
      setPendingInactiveIds(new Set());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to mark SKUs inactive",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadCsv(file: File, group: SopChannelGroup) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("year", String(year));
      form.set("group", group);
      form.set("file", file);
      const res = await fetch("/api/sales-forecast/uploads", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setWorkspace(group);
      if (isForecastGroupPayload(data)) {
        applyGroupPayload(group, data);
        const uploaded = data.uploads[0]?.row_count ?? 0;
        const pending = data.pending_skus?.length ?? 0;
        const label = group === "online" ? "Online" : "Offline";
        setNotice(
          pending > 0
            ? `Uploaded ${uploaded} known SKU${uploaded === 1 ? "" : "s"} to ${label}. ${pending} need review below.`
            : `Uploaded ${uploaded} known SKU${uploaded === 1 ? "" : "s"} to ${label}.`,
        );
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
      const input =
        group === "online" ? onlineFileRef.current : offlineFileRef.current;
      if (input) input.value = "";
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
            quantity plans. Historical L3M/L6M and monthly actuals use WMS Nett
            Sales as-is (already post-tax). Planned net = qty × RSP × (1 −
            discount) ÷ 1.11. Edit RSP on a SKU
            row to plan new launches before any sales exist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm"
            value={year}
            onChange={(e) => {
              if (
                hasUnsavedPlanDrafts() &&
                !window.confirm(
                  "You have unsaved forecast edits. Change year anyway?",
                )
              ) {
                return;
              }
              setYear(Number(e.target.value));
            }}
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
        <p className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
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
          onClick={openInactiveDialog}
          disabled={!yearData}
        >
          Inactive SKUs
          {yearData && activeGroup
            ? ` (${yearData.inactive_sku_ids[activeGroup].length})`
            : yearData
              ? ` (O ${yearData.inactive_sku_ids.online.length} / F ${yearData.inactive_sku_ids.offline.length})`
              : ""}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadTemplate}
          disabled={!yearData}
        >
          <Download className="h-4 w-4" />
          CSV template
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!yearData || readOnly || saving}
          onClick={() => onlineFileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Upload Online CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!yearData || readOnly || saving}
          onClick={() => offlineFileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Upload Offline CSV
        </Button>
        <input
          ref={onlineFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadCsv(file, "online");
          }}
        />
        <input
          ref={offlineFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadCsv(file, "offline");
          }}
        />
      </div>

      {!combined && uploads.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {activeGroup === "offline" ? "Offline" : "Online"} forecast uploads
            </CardTitle>
            <CardDescription>
              Deleting a file clears the qty/discount rows it created for this
              channel only.
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
        targetsPending={targetsPending}
        onTargetLiveChange={(group, month, value) => {
          targetDraftsRef.current = {
            ...targetDraftsRef.current,
            [group]: {
              ...targetDraftsRef.current[group],
              [month]: value,
            },
          };
          setTargetsPending(true);
        }}
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
                    : workspace === "offline"
                      ? `Offline L3M/L6M exclude ${lagMonthLabel}; sell-out usually lands 20–25 days after month end. Sort Plan, %, and L3M delta columns to find zeros and the largest gaps.`
                      : "Month headers show entered totals. Sort the active-month Plan / % headers and L3M delta columns to find zeros and the largest gaps vs L3M."
                  : "Read-only sum of SKU plans and history. Edit quantities on the SKU view."}
              </CardDescription>
              <ForecastRowLegend className="mt-3" />
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
                options={[
                  { value: "npd", label: "NPD" },
                  { value: "established", label: "Established" },
                ]}
                value={npdFilter}
                onChange={setNpdFilter}
                allLabel="All maturity"
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
              {viewMode === "sku" &&
              !combined &&
              !readOnly &&
              pendingInactiveIds.size > 0 &&
              activeGroup ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => setPendingInactiveIds(new Set())}
                  >
                    Clear ({pendingInactiveIds.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void savePendingInactive(activeGroup)}
                  >
                    Mark inactive ({activeGroup === "online" ? "Online" : "Offline"})
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => void savePendingInactive("both")}
                  >
                    Mark inactive (both)
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-5 text-sm text-stone-500">Loading forecast…</p>
          ) : !yearData ? (
            <p className="p-5 text-sm text-stone-500">No forecast data.</p>
          ) : filteredRows.length === 0 ? (
            <p className="p-5 text-sm text-stone-500">
              No active SKUs match the current filters.
            </p>
          ) : viewMode === "franchise" ? (
            <div className="max-h-[min(70vh,calc(100vh-12rem))] overflow-auto">
              <table className="w-full min-w-[80rem] border-separate border-spacing-0 text-left text-sm [&_td]:align-top">
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
                      label="On order"
                      columnKey="on_order_qty"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.onOrder)}
                      title={onOrderHint}
                    />
                    <SortTh
                      label="L3M qty"
                      columnKey="l3m_qty"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.l3m)}
                      title={runRateHint}
                      hint={
                        workspace === "offline" ? `excl. ${lagMonthLabel}` : undefined
                      }
                    />
                    <th
                      className={cn(freezeHead(FREEZE.l6m), FREEZE_EDGE)}
                      title={runRateHint}
                    >
                      L6M qty
                      {workspace === "offline" ? (
                        <div className="text-[10px] font-normal text-stone-500">
                          excl. {lagMonthLabel}
                        </div>
                      ) : null}
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      SKUs
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
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
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
                  franchiseFilter={franchiseFilter}
                  sortKey={sortKey}
                  sortDir={sortDir}
                />
              </table>
            </div>
          ) : (
            <div className="max-h-[min(70vh,calc(100vh-12rem))] overflow-auto">
              <table className="w-full min-w-[90rem] border-separate border-spacing-0 text-left text-sm [&_td]:align-top">
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
                      label="On order"
                      columnKey="on_order_qty"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.onOrder)}
                      title={onOrderHint}
                    />
                    <SortTh
                      label="L3M qty"
                      columnKey="l3m_qty"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      className={freezeHead(FREEZE.l3m)}
                      title={runRateHint}
                      hint={
                        workspace === "offline" ? `excl. ${lagMonthLabel}` : undefined
                      }
                    />
                    <th
                      className={cn(freezeHead(FREEZE.l6m), FREEZE_EDGE)}
                      title={runRateHint}
                    >
                      L6M qty
                      {workspace === "offline" ? (
                        <div className="text-[10px] font-normal text-stone-500">
                          excl. {lagMonthLabel}
                        </div>
                      ) : null}
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
                    <th
                      className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]"
                      title="Retail selling price (incl. VAT). Type a planned RSP for NPDs with no sales yet."
                    >
                      RSP
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
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
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
                    onDraftSettle={onDraftSettle}
                    registerRow={registerRow}
                    draftSeed={draftSeed}
                  />
                ) : (
                  <EditableSkuBody
                    rows={filteredRows}
                    year={yearData.year}
                    currentMonth={yearData.current_month}
                    readOnly={readOnly}
                    focusSku={focusSku}
                    getDrafts={getDrafts}
                    onDraft={onDraft}
                    onDraftSettle={onDraftSettle}
                    registerRow={registerRow}
                    draftSeed={draftSeed}
                    workspace={workspace}
                    pendingInactiveIds={pendingInactiveIds}
                    onTogglePendingInactive={
                      readOnly || combined ? undefined : togglePendingInactive
                    }
                    onSaveRsp={readOnly || combined ? undefined : onSaveRsp}
                    onChangeExistingRsp={
                      readOnly || combined ? undefined : onChangeExistingRsp
                    }
                  />
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {viewMode === "sku" && yearData && !loading ? (
        <PendingSkusCard
          rows={pendingTableRows}
          combined={combined}
          readOnly={readOnly}
          saving={saving}
          onPayload={(group, payload) => {
            applyGroupPayload(group, payload);
            setNotice(null);
          }}
          onError={(message) => setError(message || null)}
        />
      ) : null}

      {viewMode === "sku" &&
      yearData &&
      !loading &&
      filteredInactiveRows.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-stone-200">
            <CardTitle>Inactive SKUs (sales reference)</CardTitle>
            <CardDescription>
              Hidden from the main plan table for this channel, but sales history
              and L3M/L6M remain available for reference. Re-enable via Inactive
              SKUs.
            </CardDescription>
            <ForecastRowLegend className="mt-3" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[min(50vh,calc(100vh-16rem))] overflow-auto">
              <table className="w-full min-w-[90rem] border-separate border-spacing-0 text-left text-sm [&_td]:align-top">
                <thead>
                  <tr className="text-stone-500">
                    <th className={freezeHead(FREEZE.id)}>SKU</th>
                    <th className={freezeHead(FREEZE.stock)}>Stock</th>
                    <th className={freezeHead(FREEZE.onOrder)} title={onOrderHint}>
                      On order
                    </th>
                    <th className={freezeHead(FREEZE.l3m)}>L3M qty</th>
                    <th className={cn(freezeHead(FREEZE.l6m), FREEZE_EDGE)}>
                      L6M qty
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      Type
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      Franchise
                    </th>
                    <th className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                      RSP
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
                    <InactiveMonthHeaders year={yearData.year} />
                  </tr>
                </thead>
                <InactiveSkuBody
                  rows={filteredInactiveRows}
                  year={yearData.year}
                  currentMonth={yearData.current_month}
                  draftSeed={draftSeed}
                />
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

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

      <Dialog
        open={inactiveOpen}
        onClose={() => setInactiveOpen(false)}
        title="Inactive SKUs by channel"
        description="Inactive SKUs are hidden from that channel’s main forecast table. Choose Both to edit one list applied to Online and Offline together."
        className="max-w-xl"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(
              [
                ["online", "Online"],
                ["offline", "Offline"],
                ["both", "Both"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={inactiveGroup === id ? "default" : "outline"}
                onClick={() => {
                  setInactiveGroup(id);
                  setInactiveDraft(inactiveDraftForScope(id, yearData));
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <Input
            className="h-8 w-44 text-xs"
            placeholder="Search SKU"
            value={inactiveSearch}
            onChange={(e) => setInactiveSearch(e.target.value)}
          />
          <span className="text-xs text-stone-500">
            {inactiveDraft.size} inactive
            {inactiveGroup === "both" ? " (both channels)" : ""}
          </span>
        </div>
        <div className="max-h-80 space-y-1 overflow-auto">
          {(yearData?.eligible_skus ?? [])
            .filter((sku) => {
              const q = inactiveSearch.trim().toLowerCase();
              if (!q) return true;
              return (
                sku.sku_code.toLowerCase().includes(q) ||
                (sku.name ?? "").toLowerCase().includes(q) ||
                (sku.franchise_name ?? "").toLowerCase().includes(q)
              );
            })
            .map((sku) => {
              const checked = inactiveDraft.has(sku.sku_id);
              return (
                <label
                  key={sku.sku_id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => {
                      setInactiveDraft((prev) => {
                        const next = new Set(prev);
                        if (next.has(sku.sku_id)) next.delete(sku.sku_id);
                        else next.add(sku.sku_id);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-stone-900">
                      {sku.sku_code}
                    </span>
                    {sku.name ? (
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {sku.name}
                      </span>
                    ) : null}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-stone-500">
                    {sku.is_bundle ? "Bundle" : (sku.franchise_name ?? "—")}
                  </span>
                </label>
              );
            })}
          {(yearData?.eligible_skus.length ?? 0) === 0 ? (
            <p className="text-sm text-stone-500">No forecast SKUs yet.</p>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setInactiveOpen(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void saveInactiveSkus()}>
            {inactiveGroup === "both"
              ? "Save for both channels"
              : "Save inactive set"}
          </Button>
        </div>
      </Dialog>
      {pendingRsp && yearData ? (
        <RspEffectiveDialog
          key={pendingRsp.skuId}
          pending={pendingRsp}
          year={yearData.year}
          currentMonth={yearData.current_month}
          saving={savingRsp}
          onClose={() => {
            if (!savingRsp) setPendingRsp(null);
          }}
          onConfirm={(effectiveFrom) => {
            void (async () => {
              setSavingRsp(true);
              try {
                await onSaveRsp(
                  pendingRsp.skuId,
                  pendingRsp.next,
                  effectiveFrom,
                );
                setPendingRsp(null);
              } catch {
                /* error banner set in onSaveRsp */
              } finally {
                setSavingRsp(false);
              }
            })();
          }}
        />
      ) : null}
    </PageShell>
  );
}

function LegendSwatch({ className }: { className: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3 w-3 shrink-0 rounded-sm border border-stone-300",
        className,
      )}
      aria-hidden
    />
  );
}

function ForecastRowLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-600",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <LegendSwatch className="bg-rose-100 border-rose-200" />
        No RSP recorded
      </span>
      <span className="inline-flex items-center gap-1.5">
        <LegendSwatch className="bg-sky-100 border-sky-200" />
        Stock &lt; 3 months of L3M (excl. NPD)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <LegendSwatch className="bg-amber-50 border-amber-200" />
        Remaining-year shortfall (plan &gt; stock + on order)
      </span>
    </div>
  );
}

function SortTh({
  label,
  columnKey,
  active,
  dir,
  onSort,
  className,
  title,
  hint,
}: {
  label: string;
  columnKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  title?: string;
  hint?: string;
}) {
  const isActive = active === columnKey;
  return (
    <th
      className={cn(
        "sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]",
        className,
      )}
      title={title}
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
      {hint ? (
        <div className="text-[10px] font-normal text-stone-500">{hint}</div>
      ) : null}
    </th>
  );
}
