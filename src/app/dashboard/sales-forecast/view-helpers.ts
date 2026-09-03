import { MONTHS, type SopChannelGroup } from "@/lib/sales-forecast/constants";
import {
  impliedDiscountPct,
  postTaxNet,
  remainingYearShortfall,
  vatInclusiveNet,
} from "@/lib/sales-forecast/math";
import { parseNumericInput } from "@/lib/utils";
import type { SopForecastPayload, SopSkuRow } from "@/types/database";
import { draftKey, isPlanMonth, planDraftValue, rspForMonth } from "./table-utils";

export type GroupDrafts = {
  qty: Record<string, string>;
  disc: Record<string, string>;
};

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

export function draftsFromRows(rows: SopSkuRow[]): GroupDrafts {
  const qty: Record<string, string> = {};
  const disc: Record<string, string> = {};
  for (const row of rows) {
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
    lines.map((line) => [`${line.sku_id}:${line.month}`, line] as const),
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

  const rows = payload.rows.map(mapRow);
  const planned = plannedPostTaxByMonth(rows);
  return {
    ...payload,
    rows,
    inactive_rows: payload.inactive_rows.map(mapRow),
    targets: payload.targets.map((target) => {
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
    targets.map((row) => [row.month, row.target_net_sales_post_tax] as const),
  );
  return {
    ...payload,
    targets: payload.targets.map((target) => {
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

export function monthPostTaxTotal(
  rows: SopSkuRow[],
  month: number,
  currentMonth: number,
  readOnly: boolean,
  drafts: GroupDrafts,
): number {
  let planned = 0;
  for (const row of rows) {
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

export type LiveMonth = {
  month: number;
  target: number;
  planned: number;
  gap: number;
  editable: boolean;
};

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
  for (const row of payload.rows) {
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
  const onlineById = new Map(onlineRows.map((row) => [row.sku_id, row]));
  const offlineById = new Map(offlineRows.map((row) => [row.sku_id, row]));
  const skuIds = [
    ...onlineRows.map((row) => row.sku_id),
    ...offlineRows
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
  const onlineIds = new Set(onlineRows.map((row) => row.sku_id));
  return [
    ...onlineRows,
    ...offlineRows.filter((row) => !onlineIds.has(row.sku_id)),
  ];
}
