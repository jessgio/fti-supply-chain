import { MONTHS, type SopChannelGroup } from "@/lib/sales-forecast/constants";
import {
  postTaxNet,
  remainingYearShortfall,
  vatInclusiveNet,
} from "@/lib/sales-forecast/math";
import type { SopForecastPayload, SopSkuRow } from "@/types/database";
import { draftKey, isPlanMonth, planDraftValue } from "./table-utils";

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
    postTax: postTaxNet(vatInclusiveNet(safeQty, row.retail_price, safeDisc)),
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
      const target = Number(targetDrafts[group][month] ?? 0);
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
  const offlineById = new Map(offlineRows.map((row) => [row.sku_id, row]));
  return onlineRows.map((online) => {
    const offline = offlineById.get(online.sku_id);
    const months: SopSkuRow["months"] = {};
    let remainingYearQty = 0;
    for (const month of MONTHS) {
      const onlineLive = liveSkuMonthFromDrafts(
        online,
        month,
        currentMonth,
        readOnly,
        onlineDrafts,
      );
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
            (online.months[month]?.actual.qty ?? 0) +
            (offline?.months[month]?.actual.qty ?? 0),
          post_tax_net:
            (online.months[month]?.actual.post_tax_net ?? 0) +
            (offline?.months[month]?.actual.post_tax_net ?? 0),
        },
        plan: {
          projected_qty: onlineLive.qty + offlineLive.qty,
          avg_discount_pct: 0,
          vat_in_net: 0,
          post_tax_net: onlineLive.postTax + offlineLive.postTax,
          upload_id: null,
        },
      };
      if (onlineLive.editable) remainingYearQty += onlineLive.qty + offlineLive.qty;
    }
    return {
      ...online,
      l3m_qty: online.l3m_qty + (offline?.l3m_qty ?? 0),
      l3m_post_tax: online.l3m_post_tax + (offline?.l3m_post_tax ?? 0),
      l6m_qty: online.l6m_qty + (offline?.l6m_qty ?? 0),
      l6m_post_tax: online.l6m_post_tax + (offline?.l6m_post_tax ?? 0),
      remaining_year_qty: remainingYearQty,
      shortfall_qty: remainingYearShortfall(
        remainingYearQty,
        online.current_stock,
        online.on_order_qty,
      ),
      months,
    };
  });
}
