"use client";

import {
  Fragment,
  useMemo,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MONTHS } from "@/lib/sales-forecast/constants";
import {
  allocateToComponentSkus,
  UNMAPPED_FRANCHISE,
} from "@/lib/sales-forecast/franchise-rollup";
import {
  eomProjectionFromMtd,
  eomVsForecastPct,
  impliedDiscountPctFromList,
  remainingYearShortfall,
} from "@/lib/sales-forecast/math";
import { cn, formatCurrency, formatDateShort, formatNumber } from "@/lib/utils";
import type { SopChannelGroup, SopSkuRow, SopYearForecast } from "@/types/database";
import type { DraftsStore } from "./drafts-store";
import { storeServerSnapshot } from "./drafts-store";
import {
  FREEZE,
  FREEZE_EDGE,
  freezeBody,
  calendarActiveMonth,
  isCurrentCalendarMonth,
  isPlanMonth,
  rowStripeBg,
  rspForMonth,
  type ForecastSortKey,
} from "./table-utils";
import {
  liveSkuMonthFromDrafts,
  mergeLiveSkuRows,
  type GroupDrafts,
} from "./view-helpers";

type Workspace = SopChannelGroup | "combined";

type MonthAcc = {
  qty: number;
  post_tax: number;
  list_value: number;
  actual_qty: number;
  actual_post_tax: number;
  actual_list_value: number;
};

type SkuChild = {
  sku_id: string;
  sku_code: string;
  name: string | null;
  current_stock: number;
  on_order_qty: number;
  projected_stockout_date: string | null;
  l3m_qty: number;
  l3m_post_tax: number;
  l6m_qty: number;
  l6m_post_tax: number;
  remaining_year_qty: number;
  months: Record<number, MonthAcc>;
};

type FranchiseRollup = {
  key: string;
  name: string;
  skuCount: number;
  current_stock: number;
  on_order_qty: number;
  projected_stockout_date: string | null;
  l3m_qty: number;
  l3m_post_tax: number;
  l6m_qty: number;
  l6m_post_tax: number;
  remaining_year_qty: number;
  shortfall_qty: number;
  months: Record<number, MonthAcc>;
  children: SkuChild[];
};

function emptyMonths(): Record<number, MonthAcc> {
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
  return months;
}

function sharePct(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return (part / total) * 100;
}

function formatShare(part: number, total: number): string {
  const pct = sharePct(part, total);
  return pct == null ? "—" : `${formatNumber(pct, 0)}%`;
}

function signedDeltaClass(value: number): string {
  if (value > 0.0001) return "text-emerald-700";
  if (value < -0.0001) return "text-amber-700";
  return "text-stone-600";
}

function formatSignedNumber(value: number, decimals: number): string {
  const formatted = formatNumber(value, decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

function L3mDeltaPair({
  year,
  months,
  l3mQty,
  l3mPostTax,
}: {
  year: number;
  months: Record<number, { qty: number; post_tax: number }>;
  l3mQty: number;
  l3mPostTax: number;
}) {
  const month = calendarActiveMonth(year);
  if (month == null) {
    return (
      <>
        <td className="px-3 py-2.5 text-stone-400">—</td>
        <td className="px-3 py-2.5 text-stone-400">—</td>
      </>
    );
  }
  const qtyDelta = (months[month]?.qty ?? 0) - l3mQty;
  const netDelta = (months[month]?.post_tax ?? 0) - l3mPostTax;
  return (
    <>
      <td
        className={cn(
          "bg-sky-50/30 px-3 py-2.5 tabular-nums",
          signedDeltaClass(qtyDelta),
        )}
      >
        {formatSignedNumber(qtyDelta, 1)}
      </td>
      <td
        className={cn(
          "bg-sky-50/30 px-3 py-2.5 tabular-nums",
          signedDeltaClass(netDelta),
        )}
      >
        {netDelta > 0
          ? `+${formatCurrency(netDelta)}`
          : formatCurrency(netDelta)}
      </td>
    </>
  );
}

function FranchiseMonthCells({
  months,
  year,
  l3mQty,
  l3mPostTax,
  totals,
  showShare,
}: {
  months: Record<number, MonthAcc>;
  year: number;
  l3mQty: number;
  l3mPostTax: number;
  totals?: Record<number, MonthAcc>;
  showShare?: boolean;
}) {
  return (
    <>
      {MONTHS.map((month) => {
        const m = months[month] ?? emptyMonths()[month]!;
        const parent = totals?.[month];
        if (isCurrentCalendarMonth(year, month)) {
          const mtdQty = m.actual_qty;
          const mtdPostTax = m.actual_post_tax;
          const mtdDisc = impliedDiscountPctFromList(
            m.actual_list_value,
            mtdPostTax,
          );
          const eomQty = eomProjectionFromMtd(mtdQty);
          const eomPostTax = eomProjectionFromMtd(mtdPostTax);
          const planQty = m.qty;
          const planPostTax = m.post_tax;
          const planDisc = impliedDiscountPctFromList(m.list_value, planPostTax);
          const progress = eomVsForecastPct(eomPostTax, planPostTax);
          const parentEomQty = parent
            ? eomProjectionFromMtd(parent.actual_qty)
            : 0;
          const parentEomPostTax = parent
            ? eomProjectionFromMtd(parent.actual_post_tax)
            : 0;
          return (
            <Fragment key={month}>
              <td className="bg-sky-50/60 px-3 py-2.5 align-top text-xs text-stone-600">
                <div>{formatNumber(mtdQty, 1)} u</div>
                <div>{formatCurrency(mtdPostTax)}</div>
                {showShare && parent ? (
                  <div className="mt-0.5 text-[10px] text-stone-500">
                    {formatShare(mtdQty, parent.actual_qty)} qty ·{" "}
                    {formatShare(mtdPostTax, parent.actual_post_tax)} net
                  </div>
                ) : (
                  <div className="text-[11px] text-stone-500">
                    {mtdDisc == null
                      ? "—"
                      : `${formatNumber(mtdDisc, 1)}% disc`}
                  </div>
                )}
              </td>
              <td className="bg-sky-50/40 px-3 py-2.5 align-top text-xs text-stone-600">
                <div>{formatNumber(eomQty, 1)} u</div>
                <div>{formatCurrency(eomPostTax)}</div>
                {showShare && parent ? (
                  <div className="mt-0.5 text-[10px] text-stone-500">
                    {formatShare(eomQty, parentEomQty)} qty ·{" "}
                    {formatShare(eomPostTax, parentEomPostTax)} net
                  </div>
                ) : (
                  <div className="mt-0.5 text-[10px] text-stone-400">
                    run-rate
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 align-top text-xs text-stone-600">
                <div>{formatNumber(planQty, 1)} u</div>
                <div>{formatCurrency(planPostTax)}</div>
                {showShare && parent ? (
                  <div className="mt-0.5 text-[10px] text-stone-500">
                    {formatShare(planQty, parent.qty)} qty ·{" "}
                    {formatShare(planPostTax, parent.post_tax)} net
                  </div>
                ) : (
                  <div className="text-[11px] text-stone-500">
                    {planDisc == null
                      ? "—"
                      : `${formatNumber(planDisc, 1)}% disc`}
                  </div>
                )}
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
              <L3mDeltaPair
                year={year}
                months={months}
                l3mQty={l3mQty}
                l3mPostTax={l3mPostTax}
              />
            </Fragment>
          );
        }
        const disc = impliedDiscountPctFromList(m.list_value, m.post_tax);
        return (
          <td
            key={month}
            className="px-3 py-2.5 align-top text-xs text-stone-600"
          >
            <div>{formatNumber(m.qty, 1)} u</div>
            <div>{formatCurrency(m.post_tax)}</div>
            {showShare && parent ? (
              <div className="mt-0.5 text-[10px] text-stone-500">
                {formatShare(m.qty, parent.qty)} qty ·{" "}
                {formatShare(m.post_tax, parent.post_tax)} net
              </div>
            ) : (
              <div className="text-[11px] text-stone-500">
                {disc == null ? "—" : `${formatNumber(disc, 1)}% disc`}
              </div>
            )}
          </td>
        );
      })}
    </>
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
  sortKey: ForecastSortKey;
  sortDir: "asc" | "desc";
}) {
  const version = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    storeServerSnapshot,
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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
    const drafts =
      workspace === "combined" ? null : draftsRef.current[workspace];

    type Acc = {
      name: string;
      current_stock: number;
      on_order_qty: number;
      l3m_qty: number;
      l3m_post_tax: number;
      l6m_qty: number;
      l6m_post_tax: number;
      remaining_year_qty: number;
      projected_stockout_date: string | null;
      months: Record<number, MonthAcc>;
      children: Map<string, SkuChild>;
    };

    const allowFranchise = (name: string) =>
      franchiseFilter.length === 0 || franchiseFilter.includes(name);

    const rollups = new Map<string, Acc>();

    function ensureFranchise(name: string): Acc | null {
      if (!allowFranchise(name)) return null;
      let acc = rollups.get(name);
      if (!acc) {
        acc = {
          name,
          current_stock: 0,
          on_order_qty: 0,
          l3m_qty: 0,
          l3m_post_tax: 0,
          l6m_qty: 0,
          l6m_post_tax: 0,
          remaining_year_qty: 0,
          projected_stockout_date: null,
          months: emptyMonths(),
          children: new Map(),
        };
        rollups.set(name, acc);
      }
      return acc;
    }

    const singleMeta = new Map<
      string,
      { sku_code: string; name: string | null }
    >();
    for (const row of sourceRows) {
      if (!row.is_bundle) {
        singleMeta.set(row.sku_id, {
          sku_code: row.sku_code,
          name: row.name,
        });
      }
    }

    function ensureChild(
      franchise: Acc,
      part: {
        sku_id: string;
        sku_code: string;
        name: string | null;
      },
    ): SkuChild {
      let child = franchise.children.get(part.sku_id);
      const meta = singleMeta.get(part.sku_id);
      const sku_code = meta?.sku_code ?? part.sku_code;
      const name = meta?.name ?? part.name;
      if (!child) {
        child = {
          sku_id: part.sku_id,
          sku_code,
          name,
          current_stock: 0,
          on_order_qty: 0,
          projected_stockout_date: null,
          l3m_qty: 0,
          l3m_post_tax: 0,
          l6m_qty: 0,
          l6m_post_tax: 0,
          remaining_year_qty: 0,
          months: emptyMonths(),
        };
        franchise.children.set(part.sku_id, child);
      } else {
        if (meta) {
          child.sku_code = meta.sku_code;
          if (meta.name) child.name = meta.name;
        } else if (!child.name && name) {
          child.name = name;
        }
      }
      return child;
    }

    for (const row of sourceRows) {
      // Stock / on-order: singles only (avoid double-counting bundle buildable stock).
      if (!row.is_bundle) {
        const franchiseName =
          row.franchise_name?.trim() || UNMAPPED_FRANCHISE;
        const acc = ensureFranchise(franchiseName);
        if (acc) {
          acc.current_stock += row.current_stock;
          acc.on_order_qty += row.on_order_qty;
          const child = ensureChild(acc, {
            sku_id: row.sku_id,
            sku_code: row.sku_code,
            name: row.name,
          });
          child.current_stock += row.current_stock;
          child.on_order_qty += row.on_order_qty;
          if (
            row.projected_stockout_date &&
            (!acc.projected_stockout_date ||
              row.projected_stockout_date < acc.projected_stockout_date)
          ) {
            acc.projected_stockout_date = row.projected_stockout_date;
          }
          if (
            row.projected_stockout_date &&
            (!child.projected_stockout_date ||
              row.projected_stockout_date < child.projected_stockout_date)
          ) {
            child.projected_stockout_date = row.projected_stockout_date;
          }
        }
      }

      for (const part of allocateToComponentSkus(
        row,
        row.l3m_qty,
        row.l3m_post_tax,
        0,
      )) {
        const acc = ensureFranchise(part.franchise);
        if (!acc) continue;
        const child = ensureChild(acc, part);
        acc.l3m_qty += part.qty;
        acc.l3m_post_tax += part.post_tax;
        child.l3m_qty += part.qty;
        child.l3m_post_tax += part.post_tax;
      }
      for (const part of allocateToComponentSkus(
        row,
        row.l6m_qty,
        row.l6m_post_tax,
        0,
      )) {
        const acc = ensureFranchise(part.franchise);
        if (!acc) continue;
        const child = ensureChild(acc, part);
        acc.l6m_qty += part.qty;
        acc.l6m_post_tax += part.post_tax;
        child.l6m_qty += part.qty;
        child.l6m_post_tax += part.post_tax;
      }

      for (const month of MONTHS) {
        const actualQty = row.months[month]?.actual.qty ?? 0;
        const actualPostTax = row.months[month]?.actual.post_tax_net ?? 0;
        const monthRsp = rspForMonth(row, month);
        const actualList =
          monthRsp != null && monthRsp > 0 ? actualQty * monthRsp : 0;

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
              monthRsp != null && monthRsp > 0 ? qty * monthRsp : 0;
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
            monthRsp != null && monthRsp > 0 ? live.qty * monthRsp : 0;
          countsRemaining = live.editable;
        }

        for (const part of allocateToComponentSkus(
          row,
          actualQty,
          actualPostTax,
          actualList,
        )) {
          const acc = ensureFranchise(part.franchise);
          if (!acc) continue;
          const child = ensureChild(acc, part);
          acc.months[month].actual_qty += part.qty;
          acc.months[month].actual_post_tax += part.post_tax;
          acc.months[month].actual_list_value += part.list_value;
          child.months[month].actual_qty += part.qty;
          child.months[month].actual_post_tax += part.post_tax;
          child.months[month].actual_list_value += part.list_value;
        }

        for (const part of allocateToComponentSkus(
          row,
          qty,
          postTax,
          listValue,
        )) {
          const acc = ensureFranchise(part.franchise);
          if (!acc) continue;
          const child = ensureChild(acc, part);
          acc.months[month].qty += part.qty;
          acc.months[month].post_tax += part.post_tax;
          acc.months[month].list_value += part.list_value;
          child.months[month].qty += part.qty;
          child.months[month].post_tax += part.post_tax;
          child.months[month].list_value += part.list_value;
          if (countsRemaining) {
            acc.remaining_year_qty += part.qty;
            child.remaining_year_qty += part.qty;
          }
        }
      }
    }

    const rows: FranchiseRollup[] = [...rollups.values()].map((acc) => {
      const children = [...acc.children.values()].sort((a, b) =>
        a.sku_code.localeCompare(b.sku_code),
      );
      return {
        key: acc.name,
        name: acc.name,
        skuCount: children.length,
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
        children,
      };
    });

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
        case "plan_qty": {
          const month = calendarActiveMonth(yearData.year);
          cmp =
            (month == null ? 0 : (a.months[month]?.qty ?? 0)) -
            (month == null ? 0 : (b.months[month]?.qty ?? 0));
          break;
        }
        case "plan_pct": {
          const month = calendarActiveMonth(yearData.year);
          const pct = (row: (typeof rows)[number]) => {
            if (month == null) return Number.NEGATIVE_INFINITY;
            return (
              eomVsForecastPct(
                eomProjectionFromMtd(row.months[month]?.actual_post_tax ?? 0),
                row.months[month]?.post_tax ?? 0,
              ) ?? Number.NEGATIVE_INFINITY
            );
          };
          cmp = pct(a) - pct(b);
          break;
        }
        case "l3m_qty_delta": {
          const month = calendarActiveMonth(yearData.year);
          const delta = (row: (typeof rows)[number]) =>
            month == null ? 0 : (row.months[month]?.qty ?? 0) - row.l3m_qty;
          cmp = delta(a) - delta(b);
          break;
        }
        case "l3m_net_delta": {
          const month = calendarActiveMonth(yearData.year);
          const delta = (row: (typeof rows)[number]) =>
            month == null
              ? 0
              : (row.months[month]?.post_tax ?? 0) - row.l3m_post_tax;
          cmp = delta(a) - delta(b);
          break;
        }
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

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <tbody>
      {franchiseRows.map((row, index) => {
        const stripe = rowStripeBg(index, {
          warn: row.shortfall_qty > 0,
        });
        const isOpen = expanded.has(row.key);
        const childStripeFreeze = "bg-stone-50/90";
        return (
          <Fragment key={row.key}>
            <tr className={cn("border-t border-stone-200", stripe.row)}>
              <td
                className={cn(
                  freezeBody(FREEZE.id, stripe.freeze),
                  "font-medium text-stone-900",
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-1.5 text-left"
                  onClick={() => toggle(row.key)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
                  )}
                  <span>{row.name}</span>
                </button>
              </td>
              <td className={freezeBody(FREEZE.stock, stripe.freeze)}>
                {formatNumber(row.current_stock)}
              </td>
              <td className={freezeBody(FREEZE.l3m, stripe.freeze)}>
                {formatNumber(row.l3m_qty, 1)}
              </td>
              <td
                className={cn(
                  freezeBody(FREEZE.l6m, stripe.freeze),
                  FREEZE_EDGE,
                )}
              >
                {formatNumber(row.l6m_qty, 1)}
              </td>
              <td className="px-3 py-2.5">{row.skuCount}</td>
              <td className="px-3 py-2.5">{formatNumber(row.on_order_qty)}</td>
              <td className="px-3 py-2.5">
                {formatDateShort(row.projected_stockout_date)}
              </td>
              <td className="px-3 py-2.5">
                {formatCurrency(row.l3m_post_tax)}
              </td>
              <td className="px-3 py-2.5">
                {formatCurrency(row.l6m_post_tax)}
              </td>
              <FranchiseMonthCells
                months={row.months}
                year={yearData.year}
                l3mQty={row.l3m_qty}
                l3mPostTax={row.l3m_post_tax}
              />
            </tr>
            {isOpen
              ? row.children.map((child) => (
                  <tr
                    key={`${row.key}-${child.sku_id}`}
                    className="border-t border-stone-100 bg-stone-50/80"
                  >
                    <td
                      className={cn(
                        freezeBody(FREEZE.id, childStripeFreeze),
                        "align-top text-stone-700",
                      )}
                    >
                      <div className="pl-6">
                        <div className="break-all text-[13px] font-medium leading-snug">
                          {child.sku_code}
                        </div>
                        {child.name ? (
                          <div className="mt-0.5 break-words text-xs font-normal leading-snug text-stone-500">
                            {child.name}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={freezeBody(
                        FREEZE.stock,
                        childStripeFreeze,
                      )}
                    >
                      {formatNumber(child.current_stock)}
                    </td>
                    <td
                      className={freezeBody(FREEZE.l3m, childStripeFreeze)}
                    >
                      {formatNumber(child.l3m_qty, 1)}
                    </td>
                    <td
                      className={cn(
                        freezeBody(FREEZE.l6m, childStripeFreeze),
                        FREEZE_EDGE,
                      )}
                    >
                      {formatNumber(child.l6m_qty, 1)}
                    </td>
                    <td className="px-3 py-2.5 text-stone-400">—</td>
                    <td className="px-3 py-2.5">
                      {formatNumber(child.on_order_qty)}
                    </td>
                    <td className="px-3 py-2.5">
                      {formatDateShort(child.projected_stockout_date)}
                    </td>
                    <td className="px-3 py-2.5">
                      {formatCurrency(child.l3m_post_tax)}
                    </td>
                    <td className="px-3 py-2.5">
                      {formatCurrency(child.l6m_post_tax)}
                    </td>
                    <FranchiseMonthCells
                      months={child.months}
                      year={yearData.year}
                      l3mQty={child.l3m_qty}
                      l3mPostTax={child.l3m_post_tax}
                      totals={row.months}
                      showShare
                    />
                  </tr>
                ))
              : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}
