"use client";

import { memo, useMemo, useSyncExternalStore, Fragment, type MutableRefObject } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import {
  allocateSkuMetrics,
  allocateSkuScalar,
} from "@/lib/sales-forecast/franchise-rollup";
import {
  impliedDiscountPctFromList,
  remainingYearShortfall,
  eomProjectionFromMtd,
  eomVsForecastPct,
} from "@/lib/sales-forecast/math";
import { cn, formatCurrency, formatDateShort, formatNumber } from "@/lib/utils";
import type { SopChannelGroup, SopSkuRow, SopYearForecast } from "@/types/database";
import type { DraftsStore } from "./drafts-store";
import { storeServerSnapshot } from "./drafts-store";
import { ForecastRow } from "./forecast-row";
import { FREEZE, FREEZE_EDGE, freezeBody, isCurrentCalendarMonth, isPlanMonth, rowStripeBg } from "./table-utils";
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
            },
            {
              key: "eom",
              title: `${label} EOM`,
              hint: "Run-rate proj.",
              value: formatCurrency(currentMonthMtd.eom),
            },
            {
              key: "plan",
              title: `${label} Plan`,
              hint: total?.editable ? "Entered" : "Forecast",
              value: formatCurrency(planTotal),
            },
            {
              key: "pct",
              title: `${label} %`,
              hint: "EOM vs plan",
              value:
                progress == null ? "—" : `${formatNumber(progress, 0)}%`,
            },
          ] as const;
          return subHeads.map((sub) => (
            <th
              key={`${month}-${sub.key}`}
              className={cn(
                "sticky top-0 z-10 bg-sky-50 py-2 pr-3 font-medium shadow-[inset_0_-1px_0_#e7e5e4]",
                compact ? "min-w-[6.5rem]" : "min-w-[7.25rem] py-2.5",
              )}
            >
              <div>{sub.title}</div>
              <div className="mt-0.5 text-xs font-semibold tabular-nums text-stone-800">
                {sub.value}
              </div>
              {compact ? null : (
                <div className="text-[10px] font-normal text-stone-500">
                  {sub.hint}
                </div>
              )}
            </th>
          ));
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
            ["MTD", "EOM", "Plan", "%"] as const
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
  workspace,
  pendingInactiveIds,
  onTogglePendingInactive,
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
  workspace: Workspace;
  pendingInactiveIds?: Set<string>;
  onTogglePendingInactive?: (skuId: string) => void;
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
          pendingInactive={pendingInactiveIds?.has(row.sku_id) ?? false}
          onTogglePendingInactive={onTogglePendingInactive}
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

export function FranchiseBody({
  store,
  yearData,
  draftsRef,
  filteredRows,
  workspace,
  combined,
  franchiseFilter,
  sortKey,
  sortDir,
}: {
  store: DraftsStore;
  yearData: SopYearForecast;
  draftsRef: MutableRefObject<Record<SopChannelGroup, GroupDrafts>>;
  filteredRows: SopSkuRow[];
  workspace: Workspace;
  combined: boolean;
  franchiseFilter: string[];
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
    const drafts = workspace === "combined" ? null : draftsRef.current[workspace];

    type MonthAcc = {
      qty: number;
      post_tax: number;
      list_value: number;
      actual_qty: number;
      actual_post_tax: number;
      actual_list_value: number;
    };
    type Acc = {
      name: string;
      skuIds: Set<string>;
      current_stock: number;
      on_order_qty: number;
      l3m_qty: number;
      l3m_post_tax: number;
      l6m_qty: number;
      l6m_post_tax: number;
      remaining_year_qty: number;
      projected_stockout_date: string | null;
      months: Record<number, MonthAcc>;
    };

    const allowFranchise = (name: string) =>
      franchiseFilter.length === 0 || franchiseFilter.includes(name);

    const rollups = new Map<string, Acc>();
    function ensure(name: string): Acc | null {
      if (!allowFranchise(name)) return null;
      let acc = rollups.get(name);
      if (!acc) {
        const months: Record<number, MonthAcc> = {};
        for (const month of MONTHS) {
          months[month] = {
            qty: 0,
            post_tax: 0,
            list_value: 0,
            actual_qty: 0,
            actual_post_tax: 0,
            actual_list_value: 0,
          };
        }
        acc = {
          name,
          skuIds: new Set(),
          current_stock: 0,
          on_order_qty: 0,
          l3m_qty: 0,
          l3m_post_tax: 0,
          l6m_qty: 0,
          l6m_post_tax: 0,
          remaining_year_qty: 0,
          projected_stockout_date: null,
          months,
        };
        rollups.set(name, acc);
      }
      return acc;
    }

    for (const row of sourceRows) {
      for (const part of allocateSkuScalar(row, row.current_stock)) {
        const acc = ensure(part.franchise);
        if (!acc) continue;
        // Singles: stock units; bundles: component-equivalent units from buildable stock.
        acc.current_stock += row.is_bundle ? part.qtyUnits : part.value;
        acc.skuIds.add(row.sku_id);
      }
      for (const part of allocateSkuScalar(row, row.on_order_qty)) {
        const acc = ensure(part.franchise);
        if (!acc) continue;
        acc.on_order_qty += row.is_bundle ? part.qtyUnits : part.value;
      }
      for (const part of allocateSkuMetrics(
        row,
        row.l3m_qty,
        row.l3m_post_tax,
        0,
      )) {
        const acc = ensure(part.franchise);
        if (!acc) continue;
        acc.l3m_qty += part.qty;
        acc.l3m_post_tax += part.post_tax;
      }
      for (const part of allocateSkuMetrics(
        row,
        row.l6m_qty,
        row.l6m_post_tax,
        0,
      )) {
        const acc = ensure(part.franchise);
        if (!acc) continue;
        acc.l6m_qty += part.qty;
        acc.l6m_post_tax += part.post_tax;
      }

      for (const month of MONTHS) {
        const actualQty = row.months[month]?.actual.qty ?? 0;
        const actualPostTax = row.months[month]?.actual.post_tax_net ?? 0;
        const actualList =
          row.retail_price != null && row.retail_price > 0
            ? actualQty * row.retail_price
            : 0;

        let qty = actualQty;
        let postTax = actualPostTax;
        let listValue = actualList;
        let countsRemaining = false;

        if (combined || !drafts) {
          const usePlan = isPlanMonth(month, yearData.current_month, false);
          if (usePlan) {
            qty = row.months[month]?.plan.projected_qty ?? 0;
            postTax = row.months[month]?.plan.post_tax_net ?? 0;
            listValue =
              row.retail_price != null && row.retail_price > 0
                ? qty * row.retail_price
                : 0;
            countsRemaining = !yearData.read_only;
          }
        } else {
          const live = liveSkuMonthFromDrafts(
            row,
            month,
            yearData.current_month,
            yearData.read_only,
            drafts,
          );
          qty = live.qty;
          postTax = live.postTax;
          listValue =
            row.retail_price != null && row.retail_price > 0
              ? live.qty * row.retail_price
              : 0;
          countsRemaining = live.editable;
        }

        for (const part of allocateSkuMetrics(row, actualQty, actualPostTax, actualList)) {
          const acc = ensure(part.franchise);
          if (!acc) continue;
          acc.months[month].actual_qty += part.qty;
          acc.months[month].actual_post_tax += part.post_tax;
          acc.months[month].actual_list_value += part.list_value;
          if (
            row.projected_stockout_date &&
            (!acc.projected_stockout_date ||
              row.projected_stockout_date < acc.projected_stockout_date)
          ) {
            acc.projected_stockout_date = row.projected_stockout_date;
          }
        }

        for (const part of allocateSkuMetrics(row, qty, postTax, listValue)) {
          const acc = ensure(part.franchise);
          if (!acc) continue;
          acc.months[month].qty += part.qty;
          acc.months[month].post_tax += part.post_tax;
          acc.months[month].list_value += part.list_value;
          if (countsRemaining) acc.remaining_year_qty += part.qty;
        }
      }
    }

    const rows = [...rollups.values()].map((acc) => ({
      key: acc.name,
      name: acc.name,
      skuCount: acc.skuIds.size,
      current_stock: acc.current_stock,
      on_order_qty: acc.on_order_qty,
      projected_stockout_date: acc.projected_stockout_date,
      l3m_qty: acc.l3m_qty,
      l3m_post_tax: acc.l3m_post_tax,
      l6m_qty: acc.l6m_qty,
      l6m_post_tax: acc.l6m_post_tax,
      remaining_year_qty: acc.remaining_year_qty,
      shortfall_qty: remainingYearShortfall(
        acc.remaining_year_qty,
        acc.current_stock,
        acc.on_order_qty,
      ),
      months: acc.months,
    }));

    return rows.sort((a, b) => {
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
  }, [
    yearData,
    filteredRows,
    combined,
    workspace,
    franchiseFilter,
    sortKey,
    sortDir,
    version,
  ]);

  return (
    <tbody>
      {franchiseRows.map((row, index) => {
        const stripe = rowStripeBg(index, {
          warn: row.shortfall_qty > 0,
        });
        return (
          <tr
            key={row.key}
            className={cn("border-t border-stone-200", stripe.row)}
          >
            <td
              className={cn(
                freezeBody(FREEZE.id, stripe.freeze),
                "font-medium text-stone-900",
              )}
            >
              {row.name}
            </td>
            <td className={freezeBody(FREEZE.stock, stripe.freeze)}>
              {formatNumber(row.current_stock)}
            </td>
            <td className={freezeBody(FREEZE.l3m, stripe.freeze)}>
              {formatNumber(row.l3m_qty, 1)}
            </td>
            <td className={cn(freezeBody(FREEZE.l6m, stripe.freeze), FREEZE_EDGE)}>
              {formatNumber(row.l6m_qty, 1)}
            </td>
            <td className="px-3 py-2.5">{row.skuCount}</td>
            <td className="px-3 py-2.5">{formatNumber(row.on_order_qty)}</td>
            <td className="px-3 py-2.5">
              {formatDateShort(row.projected_stockout_date)}
            </td>
            <td className="px-3 py-2.5">{formatCurrency(row.l3m_post_tax)}</td>
            <td className="px-3 py-2.5">{formatCurrency(row.l6m_post_tax)}</td>
            {MONTHS.map((month) => {
              const cell = row.months[month];
              if (isCurrentCalendarMonth(yearData.year, month)) {
                const mtdQty = cell?.actual_qty ?? 0;
                const mtdPostTax = cell?.actual_post_tax ?? 0;
                const mtdDisc = impliedDiscountPctFromList(
                  cell?.actual_list_value ?? 0,
                  mtdPostTax,
                );
                const eomQty = eomProjectionFromMtd(mtdQty);
                const eomPostTax = eomProjectionFromMtd(mtdPostTax);
                const planQty = cell?.qty ?? 0;
                const planPostTax = cell?.post_tax ?? 0;
                const planDisc = impliedDiscountPctFromList(
                  cell?.list_value ?? 0,
                  planPostTax,
                );
                const progress = eomVsForecastPct(eomPostTax, planPostTax);
                return (
                  <Fragment key={month}>
                    <td className="bg-sky-50/60 px-3 py-2.5 align-top text-xs text-stone-600">
                      <div>{formatNumber(mtdQty, 1)} u</div>
                      <div>{formatCurrency(mtdPostTax)}</div>
                      <div className="text-[11px] text-stone-500">
                        {mtdDisc == null ? "—" : `${formatNumber(mtdDisc, 1)}% disc`}
                      </div>
                    </td>
                    <td className="bg-sky-50/40 px-3 py-2.5 align-top text-xs text-stone-600">
                      <div>{formatNumber(eomQty, 1)} u</div>
                      <div>{formatCurrency(eomPostTax)}</div>
                      <div className="mt-0.5 text-[10px] text-stone-400">
                        run-rate
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-stone-600">
                      <div>{formatNumber(planQty, 1)} u</div>
                      <div>{formatCurrency(planPostTax)}</div>
                      <div className="text-[11px] text-stone-500">
                        {planDisc == null
                          ? "—"
                          : `${formatNumber(planDisc, 1)}% disc`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          progress == null
                            ? "text-stone-400"
                            : progress >= 100
                              ? "text-emerald-700"
                              : progress >= 80
                                ? "text-amber-700"
                                : "text-rose-700",
                        )}
                      >
                        {progress == null ? "—" : `${formatNumber(progress, 0)}%`}
                      </p>
                      <div className="mt-0.5 text-[10px] text-stone-400">
                        EOM vs plan
                      </div>
                    </td>
                  </Fragment>
                );
              }
              const disc = impliedDiscountPctFromList(
                cell?.list_value ?? 0,
                cell?.post_tax ?? 0,
              );
              return (
                <td
                  key={month}
                  className="px-3 py-2.5 align-top text-xs text-stone-600"
                >
                  <div>{formatNumber(cell?.qty ?? 0, 1)} u</div>
                  <div>{formatCurrency(cell?.post_tax ?? 0)}</div>
                  <div className="text-[11px] text-stone-500">
                    {disc == null ? "—" : `${formatNumber(disc, 1)}% disc`}
                  </div>
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );
}
