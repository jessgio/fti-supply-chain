"use client";

import { memo, useMemo, useSyncExternalStore, type MutableRefObject } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import {
  eomProjectionFromMtd,
  eomVsForecastPct,
} from "@/lib/sales-forecast/math";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { SopChannelGroup, SopSkuRow, SopYearForecast } from "@/types/database";
import type { DraftsStore } from "./drafts-store";
import { storeServerSnapshot } from "./drafts-store";
import { ForecastRow } from "./forecast-row";
export { FranchiseBody } from "./franchise-body";
import {
  isCurrentCalendarMonth,
  type ForecastSortKey,
} from "./table-utils";
import {
  annualFromMonths,
  buildLiveGroupMonths,
  collectDirtyLines,
  formatSharePct,
  type GroupDrafts,
  liveSkuMonthFromDrafts,
  mergeLiveSkuRows,
} from "./view-helpers";

type Workspace = SopChannelGroup | "combined";

export function SkuMonthHeaders({
  store,
  yearData,
  draftsRef,
  targetDrafts,
  workspace,
  combined,
  compact,
  sortKey,
  sortDir,
  onSort,
}: {
  store: DraftsStore;
  yearData: SopYearForecast;
  draftsRef: MutableRefObject<Record<SopChannelGroup, GroupDrafts>>;
  targetDrafts: Record<SopChannelGroup, Record<number, string>>;
  workspace: Workspace;
  combined: boolean;
  compact?: boolean;
  sortKey: ForecastSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: ForecastSortKey) => void;
}) {
  const version = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    storeServerSnapshot,
  );
  const live = useMemo(() => {
    const groups = buildLiveGroupMonths(
      yearData,
      targetDrafts,
      draftsRef.current,
    );
    return combined ? groups.combined : groups[workspace];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData, targetDrafts, workspace, combined, version]);
  const headerAnnual = annualFromMonths(live);
  const currentMonthMtd = useMemo(() => {
    const now = new Date();
    if (yearData.year !== now.getFullYear()) {
      return { postTax: 0, eom: 0 };
    }
    const m = now.getMonth() + 1;
    const groupRows = combined
      ? [
          ...yearData.groups.online.rows,
          ...yearData.groups.offline.rows,
        ]
      : yearData.groups[workspace as SopChannelGroup]?.rows ?? [];
    // Combined double-counts if we concat; for combined use merge isn't available here —
    // sum online+offline is correct for channel-split actuals (same SKU in both).
    let postTax = 0;
    for (const row of groupRows) {
      postTax += row.months[m]?.actual.post_tax_net ?? 0;
    }
    return { postTax, eom: eomProjectionFromMtd(postTax) };
  }, [yearData, workspace, combined]);
  const l3mDeltas = useMemo(() => {
    const now = new Date();
    if (yearData.year !== now.getFullYear()) {
      return { qty: 0, net: 0 };
    }
    const month = now.getMonth() + 1;
    const groups: SopChannelGroup[] = combined
      ? ["online", "offline"]
      : workspace === "online" || workspace === "offline"
        ? [workspace]
        : [];
    let planQty = 0;
    let l3mQty = 0;
    let l3mPostTax = 0;
    for (const group of groups) {
      const drafts = draftsRef.current[group];
      for (const row of yearData.groups[group]?.rows ?? []) {
        planQty += liveSkuMonthFromDrafts(
          row,
          month,
          yearData.current_month,
          yearData.read_only,
          drafts,
        ).qty;
        l3mQty += row.l3m_qty ?? 0;
        l3mPostTax += row.l3m_post_tax ?? 0;
      }
    }
    const planNet = live[month - 1]?.planned ?? 0;
    return { qty: planQty - l3mQty, net: planNet - l3mPostTax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData, workspace, combined, version, live]);

  return (
    <>
      {MONTHS.map((month) => {
        const total = live[month - 1];
        const isCurrent = isCurrentCalendarMonth(yearData.year, month);
        if (isCurrent) {
          const label = MONTH_LABELS[month - 1];
          const planTotal = total?.planned ?? 0;
          const progress = eomVsForecastPct(currentMonthMtd.eom, planTotal);
          const subHeads = [
            {
              key: "mtd",
              title: `${label} MTD`,
              hint: "Sales to date",
              value: formatCurrency(currentMonthMtd.postTax),
              sortKey: null,
            },
            {
              key: "eom",
              title: `${label} EOM`,
              hint: "Run-rate proj.",
              value: formatCurrency(currentMonthMtd.eom),
              sortKey: null,
            },
            {
              key: "plan",
              title: `${label} Plan`,
              hint: total?.editable ? "Entered" : "Forecast",
              value: formatCurrency(planTotal),
              sortKey: "plan_qty" as const,
            },
            {
              key: "pct",
              title: `${label} %`,
              hint: "EOM vs plan",
              value:
                progress == null ? "—" : `${formatNumber(progress, 0)}%`,
              sortKey: "plan_pct" as const,
            },
            {
              key: "qty_delta",
              title: `${label} Δ qty`,
              hint: "Plan vs L3M",
              value:
                l3mDeltas.qty > 0
                  ? `+${formatNumber(l3mDeltas.qty, 1)}`
                  : formatNumber(l3mDeltas.qty, 1),
              sortKey: "l3m_qty_delta" as const,
            },
            {
              key: "net_delta",
              title: `${label} Δ net`,
              hint: "Plan vs L3M",
              value:
                l3mDeltas.net > 0
                  ? `+${formatCurrency(l3mDeltas.net)}`
                  : formatCurrency(l3mDeltas.net),
              sortKey: "l3m_net_delta" as const,
            },
          ] as const;
          return subHeads.map((sub) => {
            const sortable = sub.sortKey != null;
            const isActive = sortable && sortKey === sub.sortKey;
            return (
              <th
                key={`${month}-${sub.key}`}
                className={cn(
                  "sticky top-0 z-10 bg-sky-50 py-2 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]",
                  compact ? "min-w-[6.5rem]" : "min-w-[7.25rem] py-2.5",
                )}
              >
                {sortable ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 whitespace-nowrap text-left hover:text-stone-800"
                    onClick={() => onSort(sub.sortKey)}
                  >
                    {sub.title}
                    {isActive ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  <div>{sub.title}</div>
                )}
                <div className="mt-0.5 text-xs font-semibold tabular-nums text-stone-800">
                  {sub.value}
                </div>
                {compact ? null : (
                  <div className="text-[10px] font-normal text-stone-500">
                    {sub.hint}
                  </div>
                )}
              </th>
            );
          });
        }
        return (
          <th
            key={month}
            className={cn(
              "sticky top-0 z-10 bg-stone-50 py-2 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]",
              compact ? "min-w-[7rem]" : "min-w-[7.5rem] py-2.5",
            )}
          >
            <div>{MONTH_LABELS[month - 1]}</div>
            <div className="mt-0.5 text-xs font-semibold tabular-nums text-stone-800">
              {formatCurrency(total?.planned ?? 0)}
            </div>
            {compact ? null : (
              <div className="text-[10px] font-normal text-stone-500">
                {total?.editable ? "Entered total" : "Actual"}
              </div>
            )}
            <div className="text-[10px] font-normal text-stone-500">
              Target {formatSharePct(total?.target ?? 0, headerAnnual.target)} of annual
            </div>
            <div className="text-[10px] font-normal text-stone-500">
              Entered {formatSharePct(total?.planned ?? 0, headerAnnual.target)} of annual
            </div>
          </th>
        );
      })}
    </>
  );
}

export function InactiveMonthHeaders({ year }: { year: number }) {
  return (
    <>
      {MONTHS.map((month) => {
        if (isCurrentCalendarMonth(year, month)) {
          const label = MONTH_LABELS[month - 1];
          return (
            ["MTD", "EOM", "Plan", "%", "Δ qty", "Δ net"] as const
          ).map((sub) => (
            <th
              key={`${month}-${sub}`}
              className="sticky top-0 z-10 min-w-[6.5rem] bg-sky-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]"
            >
              {label} {sub}
            </th>
          ));
        }
        return (
          <th
            key={month}
            className="sticky top-0 z-10 bg-stone-50 py-2.5 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]"
          >
            {MONTH_LABELS[month - 1]}
          </th>
        );
      })}
    </>
  );
}

export const EditableSkuBody = memo(function EditableSkuBody({
  rows,
  year,
  currentMonth,
  readOnly,
  focusSku,
  getDrafts,
  onDraft,
  onDraftSettle,
  registerRow,
  draftSeed,
  liveVersion,
  workspace,
  pendingInactiveIds,
  onTogglePendingInactive,
  onSaveRsp,
  onChangeExistingRsp,
}: {
  rows: SopSkuRow[];
  year: number;
  currentMonth: number;
  readOnly: boolean;
  focusSku: string;
  getDrafts: (skuId: string, month: number, field: "qty" | "disc") => string;
  onDraft: (
    skuId: string,
    month: number,
    field: "qty" | "disc",
    value: string,
  ) => void;
  onDraftSettle: () => void;
  registerRow: (skuId: string, el: HTMLTableRowElement | null) => void;
  draftSeed: number;
  liveVersion: number;
  workspace: Workspace;
  pendingInactiveIds?: Set<string>;
  onTogglePendingInactive?: (skuId: string) => void;
  onSaveRsp?: (skuId: string, retailPrice: number | null) => Promise<void>;
  onChangeExistingRsp?: (
    skuId: string,
    skuCode: string,
    next: number,
  ) => void;
}) {
  return (
    <tbody>
      {rows.map((row, index) => (
        <ForecastRow
          key={`${workspace}-${draftSeed}-${row.sku_id}`}
          row={row}
          rowIndex={index}
          year={year}
          currentMonth={currentMonth}
          readOnly={readOnly}
          highlight={row.sku_code.toUpperCase() === focusSku}
          combined={false}
          getDrafts={getDrafts}
          onDraft={onDraft}
          onDraftSettle={onDraftSettle}
          registerRow={registerRow}
          liveVersion={liveVersion}
          pendingInactive={pendingInactiveIds?.has(row.sku_id) ?? false}
          onTogglePendingInactive={onTogglePendingInactive}
          onSaveRsp={onSaveRsp}
          onChangeExistingRsp={onChangeExistingRsp}
        />
      ))}
    </tbody>
  );
});

/** Read-only SKU rows for channel-inactive SKUs (sales reference only). */
export const InactiveSkuBody = memo(function InactiveSkuBody({
  rows,
  year,
  currentMonth,
  draftSeed,
}: {
  rows: SopSkuRow[];
  year: number;
  currentMonth: number;
  draftSeed: number;
}) {
  return (
    <tbody>
      {rows.map((row, index) => (
        <ForecastRow
          key={`inactive-${draftSeed}-${row.sku_id}`}
          row={row}
          rowIndex={index}
          year={year}
          currentMonth={currentMonth}
          readOnly
          highlight={false}
          combined
          getDrafts={() => ""}
          onDraft={() => {}}
          onDraftSettle={() => {}}
          registerRow={() => {}}
        />
      ))}
    </tbody>
  );
});

export function CombinedSkuBody({
  store,
  yearData,
  draftsRef,
  filteredOnlineRows,
  focusSku,
  getDrafts,
  onDraft,
  onDraftSettle,
  registerRow,
  draftSeed,
}: {
  store: DraftsStore;
  yearData: SopYearForecast;
  draftsRef: MutableRefObject<Record<SopChannelGroup, GroupDrafts>>;
  filteredOnlineRows: SopSkuRow[];
  focusSku: string;
  getDrafts: (skuId: string, month: number, field: "qty" | "disc") => string;
  onDraft: (
    skuId: string,
    month: number,
    field: "qty" | "disc",
    value: string,
  ) => void;
  onDraftSettle: () => void;
  registerRow: (skuId: string, el: HTMLTableRowElement | null) => void;
  draftSeed: number;
}) {
  const version = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    storeServerSnapshot,
  );
  const rows = useMemo(() => {
    const allowed = new Set(filteredOnlineRows.map((row) => row.sku_id));
    const order = filteredOnlineRows.map((row) => row.sku_id);
    const merged = mergeLiveSkuRows(
      yearData.groups.online.rows.filter((row) => allowed.has(row.sku_id)),
      yearData.groups.offline.rows.filter((row) => allowed.has(row.sku_id)),
      draftsRef.current.online,
      draftsRef.current.offline,
      yearData.current_month,
      yearData.read_only,
    );
    const byId = new Map(merged.map((row) => [row.sku_id, row]));
    return order
      .map((id) => byId.get(id))
      .filter((row): row is SopSkuRow => row != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData, filteredOnlineRows, version]);

  return (
    <tbody>
      {rows.map((row, index) => (
        <ForecastRow
          key={`combined-${draftSeed}-${row.sku_id}`}
          row={row}
          rowIndex={index}
          year={yearData.year}
          currentMonth={yearData.current_month}
          readOnly
          highlight={row.sku_code.toUpperCase() === focusSku}
          combined
          getDrafts={getDrafts}
          onDraft={onDraft}
          onDraftSettle={onDraftSettle}
          registerRow={registerRow}
        />
      ))}
    </tbody>
  );
}

export function SavePlanButton({
  store,
  yearData,
  activeGroup,
  draftsRef,
  readOnly,
  saving,
  onSave,
}: {
  store: DraftsStore;
  yearData: SopYearForecast | null;
  activeGroup: SopChannelGroup | null;
  draftsRef: MutableRefObject<Record<SopChannelGroup, GroupDrafts>>;
  readOnly: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const version = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    storeServerSnapshot,
  );
  const dirtyCount = useMemo(() => {
    if (!yearData || !activeGroup) return 0;
    return collectDirtyLines(
      yearData.groups[activeGroup],
      draftsRef.current[activeGroup],
    ).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData, activeGroup, version]);

  return (
    <Button
      size="sm"
      disabled={!yearData || readOnly || saving || dirtyCount === 0}
      onClick={onSave}
    >
      <Save className="h-4 w-4" />
      Save plan
      {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
    </Button>
  );
}
