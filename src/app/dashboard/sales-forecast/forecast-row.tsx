"use client";

import { memo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import {
  impliedDiscountPct,
  postTaxNet,
  vatInclusiveNet,
} from "@/lib/sales-forecast/math";
import { cn, formatCurrency, formatDateShort, formatNumber } from "@/lib/utils";
import type { SopSkuRow } from "@/types/database";
import {
  FREEZE,
  FREEZE_EDGE,
  freezeBody,
  isPlanMonth,
  rowStripeBg,
} from "./table-utils";

const CELL_INPUT_CLASS =
  "h-7 w-full rounded-lg border border-stone-300 bg-white px-1.5 text-xs text-stone-900 placeholder:text-stone-500 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";

function livePostTax(
  qtyText: string,
  discText: string,
  retailPrice: number | null,
): number {
  const qty = Number(qtyText || 0);
  const disc = Number(discText || 0);
  return postTaxNet(
    vatInclusiveNet(
      Number.isFinite(qty) ? qty : 0,
      retailPrice,
      Number.isFinite(disc) ? disc : 0,
    ),
  );
}

function formatDiscLabel(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${formatNumber(pct, 1)}% disc`;
}

const PlanMonthCell = memo(function PlanMonthCell({
  skuCode,
  skuId,
  month,
  retailPrice,
  initialQty,
  initialDisc,
  warn,
  onDraft,
  onDraftSettle,
}: {
  skuCode: string;
  skuId: string;
  month: number;
  retailPrice: number | null;
  initialQty: string;
  initialDisc: string;
  warn: boolean;
  onDraft: (
    skuId: string,
    month: number,
    field: "qty" | "disc",
    value: string,
  ) => void;
  onDraftSettle: () => void;
}) {
  const qtyRef = useRef(initialQty);
  const discRef = useRef(initialDisc);
  const postTaxRef = useRef<HTMLParagraphElement>(null);

  function paintPostTax() {
    const el = postTaxRef.current;
    if (!el) return;
    el.textContent = formatCurrency(
      livePostTax(qtyRef.current, discRef.current, retailPrice),
    );
  }

  return (
    <td className={`px-3 py-2.5 align-top ${warn ? "bg-amber-100/80" : ""}`}>
      <label className="mb-1 block">
        <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-stone-500">
          Qty
        </span>
        <input
          className={CELL_INPUT_CLASS}
          defaultValue={initialQty}
          onChange={(e) => {
            const value = e.target.value;
            qtyRef.current = value;
            onDraft(skuId, month, "qty", value);
            paintPostTax();
          }}
          onBlur={onDraftSettle}
          aria-label={`${skuCode} ${MONTH_LABELS[month - 1]} qty`}
          placeholder="0"
          inputMode="decimal"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-stone-500">
          Disc %
        </span>
        <input
          className={CELL_INPUT_CLASS}
          defaultValue={initialDisc}
          onChange={(e) => {
            const value = e.target.value;
            discRef.current = value;
            onDraft(skuId, month, "disc", value);
            paintPostTax();
          }}
          onBlur={onDraftSettle}
          aria-label={`${skuCode} ${MONTH_LABELS[month - 1]} discount %`}
          placeholder="0"
          inputMode="decimal"
        />
      </label>
      <p ref={postTaxRef} className="mt-1 text-[11px] text-stone-500">
        {formatCurrency(livePostTax(initialQty, initialDisc, retailPrice))}
      </p>
    </td>
  );
});

export const ForecastRow = memo(function ForecastRow({
  row,
  rowIndex,
  currentMonth,
  readOnly,
  highlight,
  combined,
  getDrafts,
  onDraft,
  onDraftSettle,
  registerRow,
}: {
  row: SopSkuRow;
  rowIndex: number;
  currentMonth: number;
  readOnly: boolean;
  highlight: boolean;
  combined: boolean;
  getDrafts: (skuId: string, month: number, field: "qty" | "disc") => string;
  onDraft: (
    skuId: string,
    month: number,
    field: "qty" | "disc",
    value: string,
  ) => void;
  onDraftSettle: () => void;
  registerRow: (skuId: string, el: HTMLTableRowElement | null) => void;
}) {
  const shortfall = row.shortfall_qty;
  const stripe = rowStripeBg(rowIndex, {
    highlight,
    warn: shortfall > 0,
  });

  return (
    <tr
      ref={(el) => registerRow(row.sku_id, el)}
      className={cn("border-t border-stone-200", stripe.row)}
    >
      <td
        className={cn(
          freezeBody(FREEZE.id, stripe.freeze),
          "font-medium text-stone-900",
        )}
      >
        <span className="block whitespace-nowrap">{row.sku_code}</span>
        {row.name ? (
          <span className="mt-0.5 block text-xs font-normal leading-snug text-stone-500">
            {row.name}
          </span>
        ) : null}
        {row.is_npd ? (
          <Badge
            className="mt-1 bg-violet-100 text-violet-800"
            title="Fewer than 3 months with sales in L3M"
          >
            NPD ({row.l3m_months_with_sales}/3)
          </Badge>
        ) : null}
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
      <td className="px-3 py-2.5">
        <Badge className="bg-stone-100 text-stone-700">
          {row.is_bundle ? "Bundle" : "Single"}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-stone-600">
        {row.is_bundle ? "—" : (row.franchise_name ?? "—")}
      </td>
      <td className="px-3 py-2.5">
        {row.retail_price != null ? formatCurrency(row.retail_price) : "—"}
      </td>
      <td className="px-3 py-2.5">{formatNumber(row.on_order_qty)}</td>
      <td className="px-3 py-2.5">{formatDateShort(row.projected_stockout_date)}</td>
      <td className="px-3 py-2.5">{formatCurrency(row.l3m_post_tax)}</td>
      <td className="px-3 py-2.5">{formatCurrency(row.l6m_post_tax)}</td>
      {MONTHS.map((month) => {
        const editable = !combined && isPlanMonth(month, currentMonth, readOnly);
        if (!editable) {
          const actual = row.months[month]?.actual;
          const plan = row.months[month]?.plan;
          const usePlan = combined && isPlanMonth(month, currentMonth, false);
          const qty = usePlan ? (plan?.projected_qty ?? 0) : (actual?.qty ?? 0);
          const postTax = usePlan
            ? (plan?.post_tax_net ?? 0)
            : (actual?.post_tax_net ?? 0);
          const disc = usePlan
            ? plan?.avg_discount_pct ?? null
            : (actual?.avg_discount_pct ??
              impliedDiscountPct(qty, row.retail_price, postTax));
          return (
            <td key={month} className="px-3 py-2.5 align-top text-xs text-stone-600">
              <div>{formatNumber(qty, 1)} u</div>
              <div>{formatCurrency(postTax)}</div>
              <div className="text-[11px] text-stone-500">{formatDiscLabel(disc)}</div>
            </td>
          );
        }
        return (
          <PlanMonthCell
            key={month}
            skuCode={row.sku_code}
            skuId={row.sku_id}
            month={month}
            retailPrice={row.retail_price}
            initialQty={getDrafts(row.sku_id, month, "qty")}
            initialDisc={getDrafts(row.sku_id, month, "disc")}
            warn={shortfall > 0}
            onDraft={onDraft}
            onDraftSettle={onDraftSettle}
          />
        );
      })}
    </tr>
  );
});
