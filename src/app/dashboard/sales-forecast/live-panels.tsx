"use client";

import { memo, useMemo, useSyncExternalStore, type MutableRefObject } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import { remainingYearShortfall } from "@/lib/sales-forecast/math";
import { cn, formatCurrency, formatDateShort, formatNumber } from "@/lib/utils";
import type { SopChannelGroup, SopSkuRow, SopYearForecast } from "@/types/database";
import type { DraftsStore } from "./drafts-store";
import { storeServerSnapshot } from "./drafts-store";
import { ForecastRow } from "./forecast-row";
import { FREEZE, FREEZE_EDGE, freezeBody, isPlanMonth } from "./table-utils";
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
}: {
  store: DraftsStore;
  yearData: SopYearForecast;
  draftsRef: MutableRefObject<Record<SopChannelGroup, GroupDrafts>>;
  targetDrafts: Record<SopChannelGroup, Record<number, string>>;
  workspace: Workspace;
  combined: boolean;
  compact?: boolean;
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

  return (
    <>
      {MONTHS.map((month) => {
        const total = live[month - 1];
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

export const EditableSkuBody = memo(function EditableSkuBody({
  rows,
  currentMonth,
  readOnly,
  focusSku,
  getDrafts,
  onDraft,
  registerRow,
  draftSeed,
  workspace,
}: {
  rows: SopSkuRow[];
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
  registerRow: (skuId: string, el: HTMLTableRowElement | null) => void;
  draftSeed: number;
  workspace: Workspace;
}) {
  return (
    <tbody>
      {rows.map((row) => (
        <ForecastRow
          key={`${workspace}-${draftSeed}-${row.sku_id}`}
          row={row}
          currentMonth={currentMonth}
          readOnly={readOnly}
          highlight={row.sku_code.toUpperCase() === focusSku}
          combined={false}
          getDrafts={getDrafts}
          onDraft={onDraft}
          registerRow={registerRow}
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
    return mergeLiveSkuRows(
      yearData.groups.online.rows.filter((row) => allowed.has(row.sku_id)),
      yearData.groups.offline.rows.filter((row) => allowed.has(row.sku_id)),
      draftsRef.current.online,
      draftsRef.current.offline,
      yearData.current_month,
      yearData.read_only,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData, filteredOnlineRows, version]);

  return (
    <tbody>
      {rows.map((row) => (
        <ForecastRow
          key={`combined-${draftSeed}-${row.sku_id}`}
          row={row}
          currentMonth={yearData.current_month}
          readOnly
          highlight={row.sku_code.toUpperCase() === focusSku}
          combined
          getDrafts={getDrafts}
          onDraft={onDraft}
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

export function FranchiseBody({
  store,
  yearData,
  draftsRef,
  filteredRows,
  workspace,
  combined,
  sortKey,
  sortDir,
}: {
  store: DraftsStore;
  yearData: SopYearForecast;
  draftsRef: MutableRefObject<Record<SopChannelGroup, GroupDrafts>>;
  filteredRows: SopSkuRow[];
  workspace: Workspace;
  combined: boolean;
  sortKey: "sku_code" | "franchise_name" | "current_stock" | "l3m_qty" | "shortfall_qty";
  sortDir: "asc" | "desc";
}) {
  const version = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    storeServerSnapshot,
  );

  const franchiseRows = useMemo(() => {
    const allowed = new Set(filteredRows.map((row) => row.sku_id));
    const sourceRows = combined
      ? mergeLiveSkuRows(
          yearData.groups.online.rows.filter((row) => allowed.has(row.sku_id)),
          yearData.groups.offline.rows.filter((row) => allowed.has(row.sku_id)),
          draftsRef.current.online,
          draftsRef.current.offline,
          yearData.current_month,
          yearData.read_only,
        )
      : filteredRows;
    const groups = new Map<string, SopSkuRow[]>();
    for (const row of sourceRows) {
      const key = row.is_bundle ? "Bundles" : (row.franchise_name ?? "Unmapped");
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    const drafts = workspace === "combined" ? null : draftsRef.current[workspace];
    const rollups = [...groups.entries()].map(([name, rows]) => {
      let current_stock = 0;
      let on_order_qty = 0;
      let l3m_qty = 0;
      let l3m_post_tax = 0;
      let l6m_qty = 0;
      let l6m_post_tax = 0;
      let remaining_year_qty = 0;
      let projected_stockout_date: string | null = null;
      const months: Record<number, { qty: number; post_tax: number }> = {};
      for (const month of MONTHS) {
        months[month] = { qty: 0, post_tax: 0 };
      }
      for (const row of rows) {
        current_stock += row.current_stock;
        on_order_qty += row.on_order_qty;
        l3m_qty += row.l3m_qty;
        l3m_post_tax += row.l3m_post_tax;
        l6m_qty += row.l6m_qty;
        l6m_post_tax += row.l6m_post_tax;
        if (
          row.projected_stockout_date &&
          (!projected_stockout_date ||
            row.projected_stockout_date < projected_stockout_date)
        ) {
          projected_stockout_date = row.projected_stockout_date;
        }
        for (const month of MONTHS) {
          if (combined || !drafts) {
            const usePlan = isPlanMonth(month, yearData.current_month, false);
            const qty = usePlan
              ? (row.months[month]?.plan.projected_qty ?? 0)
              : (row.months[month]?.actual.qty ?? 0);
            const postTax = usePlan
              ? (row.months[month]?.plan.post_tax_net ?? 0)
              : (row.months[month]?.actual.post_tax_net ?? 0);
            months[month].qty += qty;
            months[month].post_tax += postTax;
            if (usePlan && !yearData.read_only) remaining_year_qty += qty;
          } else {
            const live = liveSkuMonthFromDrafts(
              row,
              month,
              yearData.current_month,
              yearData.read_only,
              drafts,
            );
            months[month].qty += live.qty;
            months[month].post_tax += live.postTax;
            if (live.editable) remaining_year_qty += live.qty;
          }
        }
      }
      return {
        key: name,
        name,
        skuCount: rows.length,
        current_stock,
        on_order_qty,
        projected_stockout_date,
        l3m_qty,
        l3m_post_tax,
        l6m_qty,
        l6m_post_tax,
        remaining_year_qty,
        shortfall_qty: remainingYearShortfall(
          remaining_year_qty,
          current_stock,
          on_order_qty,
        ),
        months,
      };
    });
    return rollups.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "sku_code":
        case "franchise_name":
          cmp = a.name.localeCompare(b.name);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData, filteredRows, combined, workspace, sortKey, sortDir, version]);

  return (
    <tbody>
      {franchiseRows.map((row) => {
        const freezeBg = row.shortfall_qty > 0 ? "bg-amber-50" : "bg-white";
        return (
          <tr
            key={row.key}
            className={`border-t border-stone-100 ${
              row.shortfall_qty > 0 ? "bg-amber-50/60" : "bg-white"
            }`}
          >
            <td
              className={cn(
                freezeBody(FREEZE.id, freezeBg),
                "font-medium text-stone-900",
              )}
            >
              {row.name}
            </td>
            <td className={freezeBody(FREEZE.stock, freezeBg)}>
              {formatNumber(row.current_stock)}
            </td>
            <td className={freezeBody(FREEZE.l3m, freezeBg)}>
              {formatNumber(row.l3m_qty, 1)}
            </td>
            <td className={cn(freezeBody(FREEZE.l6m, freezeBg), FREEZE_EDGE)}>
              {formatNumber(row.l6m_qty, 1)}
            </td>
            <td className="px-3 py-2.5">{row.skuCount}</td>
            <td className="px-3 py-2.5">{formatNumber(row.on_order_qty)}</td>
            <td className="px-3 py-2.5">
              {formatDateShort(row.projected_stockout_date)}
            </td>
            <td className="px-3 py-2.5">{formatCurrency(row.l3m_post_tax)}</td>
            <td className="px-3 py-2.5">{formatCurrency(row.l6m_post_tax)}</td>
            {MONTHS.map((month) => (
              <td
                key={month}
                className="px-3 py-2.5 align-top text-xs text-stone-600"
              >
                <div>{formatNumber(row.months[month]?.qty ?? 0, 1)} u</div>
                <div>{formatCurrency(row.months[month]?.post_tax ?? 0)}</div>
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}
