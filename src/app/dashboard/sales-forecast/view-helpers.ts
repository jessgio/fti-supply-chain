import {
  MONTH_LABELS,
  MONTHS,
  type SopChannelGroup,
} from "@/lib/sales-forecast/constants";
import {
  eomProjectionFromMtd,
  eomVsForecastPct,
  impliedDiscountPct,
  pctVsBaseline,
  postTaxNet,
  remainingYearShortfall,
  vatInclusiveNet,
} from "@/lib/sales-forecast/math";
import { formatNumber, parseNumericInput } from "@/lib/utils";
import type { SopForecastPayload, SopSkuRow } from "@/types/database";
import { draftKey, isPlanMonth, planDraftValue, rspForMonth } from "./table-utils";

export type GroupDrafts = {
  qty: Record<string, string>;
  disc: Record<string, string>;
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function sharePct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return null;
  }
  return (part / whole) * 100;
}

/** Contribution to an annual total, e.g. 13% or 11.4%. */
export function formatSharePct(part: number, whole: number): string {
  const pct = sharePct(part, whole);
  if (pct == null) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`;
}

export function annualFromMonths(
  months: Array<{ target: number; planned: number }>,
): {
  target: number;
  planned: number;
  gap: number;
  short: boolean;
} {
  let target = 0;
  let planned = 0;
  for (const month of months) {
    target += month.target;
    planned += month.planned;
  }
  return {
    target,
    planned,
    gap: planned - target,
    short: target > 0 && planned < target,
  };
}

export function draftsFromRows(rows: SopSkuRow[] | null | undefined): GroupDrafts {
  const qty: Record<string, string> = {};
  const disc: Record<string, string> = {};
  for (const row of asArray(rows)) {
    for (const month of MONTHS) {
      const plan = row.months[month]?.plan;
      qty[draftKey(row.sku_id, month)] = planDraftValue(plan?.projected_qty);
      disc[draftKey(row.sku_id, month)] = planDraftValue(plan?.avg_discount_pct);
    }
  }
  return { qty, disc };
}

function plannedPostTaxByMonth(
  rows: SopSkuRow[],
): Map<number, number> {
  const planned = new Map<number, number>();
  for (const row of rows) {
    for (const month of MONTHS) {
      planned.set(
        month,
        (planned.get(month) ?? 0) + (row.months[month]?.plan.post_tax_net ?? 0),
      );
    }
  }
  return planned;
}

/** Apply saved qty/discount lines onto an already-loaded forecast payload. */
export function mergeSavedPlanLines(
  payload: SopForecastPayload,
  lines: Array<{
    sku_id: string;
    month: number;
    projected_qty: number;
    avg_discount_pct: number;
  }>,
): SopForecastPayload {
  const byKey = new Map(
    asArray(lines).map((line) => [`${line.sku_id}:${line.month}`, line] as const),
  );
  if (byKey.size === 0) return payload;

  const mapRow = (row: SopSkuRow): SopSkuRow => {
    let touched = false;
    const months = { ...row.months };
    for (const month of MONTHS) {
      const line = byKey.get(`${row.sku_id}:${month}`);
      if (!line) continue;
      touched = true;
      const monthRsp = rspForMonth(row, month);
      const vatIn = vatInclusiveNet(
        line.projected_qty,
        monthRsp,
        line.avg_discount_pct,
      );
      const prev = months[month];
      months[month] = {
        actual: prev?.actual ?? { qty: 0, post_tax_net: 0 },
        plan: {
          projected_qty: line.projected_qty,
          avg_discount_pct: line.avg_discount_pct,
          vat_in_net: vatIn,
          post_tax_net: postTaxNet(vatIn),
          upload_id: prev?.plan.upload_id ?? null,
        },
      };
    }
    if (!touched) return row;

    let remainingYearQty = 0;
    for (const month of MONTHS) {
      if (!isPlanMonth(month, payload.current_month, payload.read_only)) {
        continue;
      }
      remainingYearQty += months[month]?.plan.projected_qty ?? 0;
    }
    return {
      ...row,
      months,
      remaining_year_qty: remainingYearQty,
      shortfall_qty: remainingYearShortfall(
        remainingYearQty,
        row.current_stock,
        row.on_order_qty,
      ),
    };
  };

  const rows = asArray(payload.rows).map(mapRow);
  const planned = plannedPostTaxByMonth(rows);
  return {
    ...payload,
    rows,
    inactive_rows: asArray(payload.inactive_rows).map(mapRow),
    targets: asArray(payload.targets).map((target) => {
      const plannedPostTax = planned.get(target.month) ?? 0;
      return {
        ...target,
        planned_post_tax: plannedPostTax,
        gap: plannedPostTax - target.target_net_sales_post_tax,
      };
    }),
  };
}

export function mergeSavedTargets(
  payload: SopForecastPayload,
  targets: Array<{ month: number; target_net_sales_post_tax: number }>,
): SopForecastPayload {
  const byMonth = new Map(
    asArray(targets).map((row) => [row.month, row.target_net_sales_post_tax] as const),
  );
  return {
    ...payload,
    targets: asArray(payload.targets).map((target) => {
      const next = byMonth.get(target.month);
      if (next == null || !Number.isFinite(next)) return target;
      return {
        ...target,
        target_net_sales_post_tax: next,
        gap: target.planned_post_tax - next,
      };
    }),
  };
}

export function liveSkuMonthFromDrafts(
  row: SopSkuRow,
  month: number,
  currentMonth: number,
  readOnly: boolean,
  drafts: GroupDrafts,
): { qty: number; postTax: number; editable: boolean } {
  const editable = isPlanMonth(month, currentMonth, readOnly);
  if (!editable) {
    const actual = row.months[month]?.actual;
    return {
      qty: actual?.qty ?? 0,
      postTax: actual?.post_tax_net ?? 0,
      editable: false,
    };
  }
  const qty = Number(drafts.qty[draftKey(row.sku_id, month)] ?? 0);
  const disc = Number(drafts.disc[draftKey(row.sku_id, month)] ?? 0);
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safeDisc = Number.isFinite(disc) ? disc : 0;
  return {
    qty: safeQty,
    postTax: postTaxNet(
      vatInclusiveNet(safeQty, rspForMonth(row, month), safeDisc),
    ),
    editable: true,
  };
}

export type ActiveMonthSortMetrics = {
  planQty: number;
  planPostTax: number;
  planPct: number | null;
  qtyDelta: number;
  netDelta: number;
};

function storedPlanForMonth(
  row: SopSkuRow,
  month: number,
): { qty: number; postTax: number } {
  const plan = row.months[month]?.plan;
  return {
    qty: plan?.projected_qty ?? 0,
    postTax: plan?.post_tax_net ?? 0,
  };
}

export function livePlanForMonth(
  row: SopSkuRow,
  month: number,
  currentMonth: number,
  readOnly: boolean,
  drafts: GroupDrafts | null,
): { qty: number; postTax: number } {
  if (drafts && isPlanMonth(month, currentMonth, readOnly)) {
    const live = liveSkuMonthFromDrafts(
      row,
      month,
      currentMonth,
      readOnly,
      drafts,
    );
    return { qty: live.qty, postTax: live.postTax };
  }
  return storedPlanForMonth(row, month);
}

export function activeMonthProgressPct(
  row: SopSkuRow,
  month: number,
  planPostTax: number,
): number | null {
  const mtd = row.months[month]?.actual.post_tax_net ?? 0;
  return eomVsForecastPct(eomProjectionFromMtd(mtd), planPostTax);
}

export function activeMonthSortMetrics(
  row: SopSkuRow,
  month: number | null,
  currentMonth: number,
  readOnly: boolean,
  drafts: GroupDrafts | null,
): ActiveMonthSortMetrics {
  if (month == null) {
    return {
      planQty: 0,
      planPostTax: 0,
      planPct: null,
      qtyDelta: 0,
      netDelta: 0,
    };
  }
  const plan = livePlanForMonth(
    row,
    month,
    currentMonth,
    readOnly,
    drafts,
  );
  return {
    planQty: plan.qty,
    planPostTax: plan.postTax,
    planPct: activeMonthProgressPct(row, month, plan.postTax),
    qtyDelta: plan.qty - (row.l3m_qty ?? 0),
    netDelta: plan.postTax - (row.l3m_post_tax ?? 0),
  };
}

export function combinedActiveMonthSortMetrics(
  online: SopSkuRow | undefined,
  offline: SopSkuRow | undefined,
  month: number | null,
  currentMonth: number,
  readOnly: boolean,
  onlineDrafts: GroupDrafts,
  offlineDrafts: GroupDrafts,
): ActiveMonthSortMetrics {
  if (month == null || (!online && !offline)) {
    return {
      planQty: 0,
      planPostTax: 0,
      planPct: null,
      qtyDelta: 0,
      netDelta: 0,
    };
  }
  const on = online
    ? livePlanForMonth(online, month, currentMonth, readOnly, onlineDrafts)
    : { qty: 0, postTax: 0 };
  const off = offline
    ? livePlanForMonth(offline, month, currentMonth, readOnly, offlineDrafts)
    : { qty: 0, postTax: 0 };
  const planQty = on.qty + off.qty;
  const planPostTax = on.postTax + off.postTax;
  const l3mQty = (online?.l3m_qty ?? 0) + (offline?.l3m_qty ?? 0);
  const l3mPost = (online?.l3m_post_tax ?? 0) + (offline?.l3m_post_tax ?? 0);
  const mtd =
    (online?.months[month]?.actual.post_tax_net ?? 0) +
    (offline?.months[month]?.actual.post_tax_net ?? 0);
  return {
    planQty,
    planPostTax,
    planPct: eomVsForecastPct(eomProjectionFromMtd(mtd), planPostTax),
    qtyDelta: planQty - l3mQty,
    netDelta: planPostTax - l3mPost,
  };
}

export function monthPostTaxTotal(
  rows: SopSkuRow[],
  month: number,
  currentMonth: number,
  readOnly: boolean,
  drafts: GroupDrafts,
): number {
  let planned = 0;
  for (const row of asArray(rows)) {
    planned += liveSkuMonthFromDrafts(
      row,
      month,
      currentMonth,
      readOnly,
      drafts,
    ).postTax;
  }
  return planned;
}

/** Planned post-tax for an editable month, using the same draft getters as the row cells. */
export function sumDraftPlanPostTax(
  rows: SopSkuRow[],
  month: number,
  getDrafts: (skuId: string, month: number, field: "qty" | "disc") => string,
): number {
  let total = 0;
  for (const row of asArray(rows)) {
    const qty = Number(getDrafts(row.sku_id, month, "qty") || 0);
    const disc = Number(getDrafts(row.sku_id, month, "disc") || 0);
    total += postTaxNet(
      vatInclusiveNet(
        Number.isFinite(qty) ? qty : 0,
        rspForMonth(row, month),
        Number.isFinite(disc) ? disc : 0,
      ),
    );
  }
  return total;
}

export function sumStoredPlanPostTax(rows: SopSkuRow[], month: number): number {
  let total = 0;
  for (const row of asArray(rows)) {
    total += row.months[month]?.plan.post_tax_net ?? 0;
  }
  return total;
}

export type LiveMonth = {
  month: number;
  target: number;
  planned: number;
  gap: number;
  editable: boolean;
};

/**
 * Net used for month-on-month growth: closed months use actuals (`planned`
 * on a non-editable LiveMonth), current and future months use the target.
 */
export function momComparableNet(
  live: Pick<LiveMonth, "planned" | "target">,
  year: number,
  month: number,
  now: Date = new Date(),
): number {
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  if (year < nowYear) return live.planned;
  if (year > nowYear) return live.target;
  if (month < nowMonth) return live.planned;
  return live.target;
}

export function monthOnMonthGrowth(
  live: LiveMonth[],
  year: number,
  month: number,
  now: Date = new Date(),
): {
  pct: number | null;
  prevMonth: number | null;
  required: boolean;
} {
  if (month <= 1) {
    return { pct: null, prevMonth: null, required: false };
  }
  const current = live[month - 1];
  const prev = live[month - 2];
  if (!current || !prev) {
    return { pct: null, prevMonth: month - 1, required: false };
  }
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const required = year > nowYear || (year === nowYear && month >= nowMonth);
  return {
    pct: pctVsBaseline(
      momComparableNet(current, year, month, now),
      momComparableNet(prev, year, month - 1, now),
    ),
    prevMonth: month - 1,
    required,
  };
}

export function formatMomLine(
  pct: number | null,
  prevMonth: number | null,
  required: boolean,
): string | null {
  if (prevMonth == null) return null;
  const prev = MONTH_LABELS[prevMonth - 1];
  if (pct == null) return `MoM — vs ${prev}`;
  if (required && pct > 0) {
    return `Must earn +${formatNumber(pct, 0)}% vs ${prev}`;
  }
  const sign = pct > 0 ? "+" : "";
  return `MoM ${sign}${formatNumber(pct, 0)}% vs ${prev}`;
}

export function momLineClass(pct: number | null, required: boolean): string {
  if (pct == null) return "text-stone-400";
  if (required && pct > 0) return "text-amber-800";
  if (pct > 0) return "text-emerald-700";
  if (pct < 0) return "text-rose-700";
  return "text-stone-500";
}

export function gapToneClass(gap: number, target: number): string {
  if (!(target > 0)) return "text-stone-500";
  if (gap < -0.5) return "text-rose-700";
  if (gap > 0.5) return "text-emerald-700";
  return "text-stone-600";
}

export function buildLiveGroupMonths(
  yearData: {
    current_month: number;
    read_only: boolean;
    groups: Record<SopChannelGroup, { rows: SopSkuRow[] }>;
  },
  targetDrafts: Record<SopChannelGroup, Record<number, string>>,
  drafts: Record<SopChannelGroup, GroupDrafts>,
): Record<SopChannelGroup | "combined", LiveMonth[]> {
  const build = (group: SopChannelGroup): LiveMonth[] =>
    MONTHS.map((month) => {
      const target = parseNumericInput(targetDrafts[group][month]);
      const safeTarget = Number.isFinite(target) ? target : 0;
      const planned = monthPostTaxTotal(
        yearData.groups[group].rows,
        month,
        yearData.current_month,
        yearData.read_only,
        drafts[group],
      );
      return {
        month,
        target: safeTarget,
        planned,
        gap: planned - safeTarget,
        editable: isPlanMonth(month, yearData.current_month, yearData.read_only),
      };
    });
  const online = build("online");
  const offline = build("offline");
  const combined = MONTHS.map((month, i) => ({
    month,
    target: online[i].target + offline[i].target,
    planned: online[i].planned + offline[i].planned,
    gap:
      online[i].planned +
      offline[i].planned -
      (online[i].target + offline[i].target),
    editable: online[i].editable,
  }));
  return { online, offline, combined };
}

export function collectDirtyLines(
  payload: SopForecastPayload,
  drafts: GroupDrafts,
): Array<{
  sku_id: string;
  month: number;
  projected_qty: number;
  avg_discount_pct: number;
}> {
  const lines: Array<{
    sku_id: string;
    month: number;
    projected_qty: number;
    avg_discount_pct: number;
  }> = [];
  for (const row of asArray(payload.rows)) {
    for (const month of MONTHS) {
      if (!isPlanMonth(month, payload.current_month, payload.read_only)) {
        continue;
      }
      const key = draftKey(row.sku_id, month);
      const qty = Number(drafts.qty[key] ?? 0);
      const disc = Number(drafts.disc[key] ?? 0);
      const original = row.months[month]?.plan;
      if (
        qty !== (original?.projected_qty ?? 0) ||
        disc !== (original?.avg_discount_pct ?? 0)
      ) {
        lines.push({
          sku_id: row.sku_id,
          month,
          projected_qty: Number.isFinite(qty) ? qty : 0,
          avg_discount_pct: Number.isFinite(disc) ? disc : 0,
        });
      }
    }
  }
  return lines;
}

export function mergeLiveSkuRows(
  onlineRows: SopSkuRow[],
  offlineRows: SopSkuRow[],
  onlineDrafts: GroupDrafts,
  offlineDrafts: GroupDrafts,
  currentMonth: number,
  readOnly: boolean,
): SopSkuRow[] {
  const onlineList = asArray(onlineRows);
  const offlineList = asArray(offlineRows);
  const onlineById = new Map(onlineList.map((row) => [row.sku_id, row]));
  const offlineById = new Map(offlineList.map((row) => [row.sku_id, row]));
  const skuIds = [
    ...onlineList.map((row) => row.sku_id),
    ...offlineList
      .filter((row) => !onlineById.has(row.sku_id))
      .map((row) => row.sku_id),
  ];

  return skuIds.map((skuId) => {
    const online = onlineById.get(skuId);
    const offline = offlineById.get(skuId);
    const base = online ?? offline!;
    const months: SopSkuRow["months"] = {};
    let remainingYearQty = 0;
    for (const month of MONTHS) {
      const onlineLive = online
        ? liveSkuMonthFromDrafts(
            online,
            month,
            currentMonth,
            readOnly,
            onlineDrafts,
          )
        : { qty: 0, postTax: 0, editable: !readOnly && month >= currentMonth };
      const offlineLive = offline
        ? liveSkuMonthFromDrafts(
            offline,
            month,
            currentMonth,
            readOnly,
            offlineDrafts,
          )
        : { qty: 0, postTax: 0, editable: onlineLive.editable };
      months[month] = {
        actual: {
          qty:
            (online?.months[month]?.actual.qty ?? 0) +
            (offline?.months[month]?.actual.qty ?? 0),
          post_tax_net:
            (online?.months[month]?.actual.post_tax_net ?? 0) +
            (offline?.months[month]?.actual.post_tax_net ?? 0),
          avg_discount_pct: impliedDiscountPct(
            (online?.months[month]?.actual.qty ?? 0) +
              (offline?.months[month]?.actual.qty ?? 0),
            rspForMonth(base, month),
            (online?.months[month]?.actual.post_tax_net ?? 0) +
              (offline?.months[month]?.actual.post_tax_net ?? 0),
          ),
        },
        plan: {
          projected_qty: onlineLive.qty + offlineLive.qty,
          avg_discount_pct: 0,
          vat_in_net: 0,
          post_tax_net: onlineLive.postTax + offlineLive.postTax,
          upload_id: null,
        },
      };
      if (onlineLive.editable || offlineLive.editable) {
        remainingYearQty += onlineLive.qty + offlineLive.qty;
      }
    }
    const l3m_months_with_sales = Math.max(
      online?.l3m_months_with_sales ?? 0,
      offline?.l3m_months_with_sales ?? 0,
    );
    return {
      ...base,
      bom_components: base.bom_components ?? [],
      l3m_qty: (online?.l3m_qty ?? 0) + (offline?.l3m_qty ?? 0),
      l3m_post_tax: (online?.l3m_post_tax ?? 0) + (offline?.l3m_post_tax ?? 0),
      l6m_qty: (online?.l6m_qty ?? 0) + (offline?.l6m_qty ?? 0),
      l6m_post_tax: (online?.l6m_post_tax ?? 0) + (offline?.l6m_post_tax ?? 0),
      l3m_months_with_sales,
      is_npd: l3m_months_with_sales < 3,
      remaining_year_qty: remainingYearQty,
      shortfall_qty: remainingYearShortfall(
        remainingYearQty,
        base.current_stock,
        base.on_order_qty,
      ),
      months,
    };
  });
}

/** Prefer online row identity; include offline-only SKUs for combined filters. */
export function unionChannelSkuRows(
  onlineRows: SopSkuRow[],
  offlineRows: SopSkuRow[],
): SopSkuRow[] {
  const online = asArray(onlineRows);
  const offline = asArray(offlineRows);
  const onlineIds = new Set(online.map((row) => row.sku_id));
  return [
    ...online,
    ...offline.filter((row) => !onlineIds.has(row.sku_id)),
  ];
}
