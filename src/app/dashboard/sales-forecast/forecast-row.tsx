"use client";

import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import {
  eomProjectionFromMtd,
  eomVsForecastPct,
  impliedDiscountPct,
  pctVsBaseline,
  postTaxNet,
  vatInclusiveNet,
} from "@/lib/sales-forecast/math";
import { cn, formatCurrency, formatDateShort, formatNumber } from "@/lib/utils";
import type { SopSkuRow } from "@/types/database";
import {
  FREEZE,
  FREEZE_EDGE,
  freezeBody,
  hasLowL3mCover,
  hasMissingRsp,
  isCurrentCalendarMonth,
  isPlanMonth,
  rowStripeBg,
  rspForMonth,
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

function formatPctVsL3m(pct: number | null, label: string): string {
  if (pct == null) return `${label} — vs L3M`;
  const sign = pct > 0 ? "+" : "";
  return `${label} ${sign}${formatNumber(pct, 0)}% vs L3M`;
}

function pctCueClass(pct: number | null): string {
  if (pct == null) return "text-stone-400";
  return pct >= 0 ? "text-emerald-700" : "text-amber-700";
}

function formatEomProgress(pct: number | null): string {
  if (pct == null) return "—";
  return `${formatNumber(pct, 0)}%`;
}

function eomProgressClass(pct: number | null): string {
  if (pct == null) return "text-stone-400";
  if (pct >= 100) return "text-emerald-700";
  if (pct >= 80) return "text-amber-700";
  return "text-rose-700";
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

function ReadonlyMetricCell({
  qty,
  postTax,
  disc,
  footer,
  className,
}: {
  qty: number;
  postTax: number;
  disc: number | null | undefined;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-top text-xs text-stone-600",
        className,
      )}
    >
      <div>{formatNumber(qty, 1)} u</div>
      <div>{formatCurrency(postTax)}</div>
      <div className="text-[11px] text-stone-500">{formatDiscLabel(disc)}</div>
      {footer}
    </td>
  );
}

const PlanMonthCell = memo(function PlanMonthCell({
  skuCode,
  skuId,
  month,
  retailPrice,
  l3mQty,
  l3mPostTax,
  initialQty,
  initialDisc,
  warn,
  onDraft,
  onDraftSettle,
  eomPostTax,
  progressRef,
}: {
  skuCode: string;
  skuId: string;
  month: number;
  retailPrice: number | null;
  l3mQty: number;
  l3mPostTax: number;
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
  /** When set, live-update EOM vs plan % in the paired progress cell. */
  eomPostTax?: number;
  progressRef?: RefObject<HTMLParagraphElement | null>;
}) {
  const qtyRef = useRef(initialQty);
  const discRef = useRef(initialDisc);
  const postTaxRef = useRef<HTMLParagraphElement>(null);
  const qtyCueRef = useRef<HTMLParagraphElement>(null);
  const netCueRef = useRef<HTMLParagraphElement>(null);

  function paintCues() {
    const qtyNum = Number(qtyRef.current || 0);
    const qty = Number.isFinite(qtyNum) ? qtyNum : 0;
    const postTax = livePostTax(qtyRef.current, discRef.current, retailPrice);
    const qtyPct = pctVsBaseline(qty, l3mQty);
    const netPct = pctVsBaseline(postTax, l3mPostTax);

    if (postTaxRef.current) {
      postTaxRef.current.textContent = formatCurrency(postTax);
    }
    if (qtyCueRef.current) {
      qtyCueRef.current.textContent = formatPctVsL3m(qtyPct, "Qty");
      qtyCueRef.current.className = cn(
        "mt-0.5 text-[10px] leading-tight",
        pctCueClass(qtyPct),
      );
    }
    if (netCueRef.current) {
      netCueRef.current.textContent = formatPctVsL3m(netPct, "Net");
      netCueRef.current.className = cn(
        "text-[10px] leading-tight",
        pctCueClass(netPct),
      );
    }
    if (progressRef?.current && eomPostTax != null) {
      const progress = eomVsForecastPct(eomPostTax, postTax);
      progressRef.current.textContent = formatEomProgress(progress);
      progressRef.current.className = cn(
        "text-sm font-semibold tabular-nums",
        eomProgressClass(progress),
      );
    }
  }

  const initialPostTax = livePostTax(initialQty, initialDisc, retailPrice);
  const initialQtyPct = pctVsBaseline(
    Number(initialQty || 0) || 0,
    l3mQty,
  );
  const initialNetPct = pctVsBaseline(initialPostTax, l3mPostTax);

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
            paintCues();
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
            paintCues();
          }}
          onBlur={onDraftSettle}
          aria-label={`${skuCode} ${MONTH_LABELS[month - 1]} discount %`}
          placeholder="0"
          inputMode="decimal"
        />
      </label>
      <p ref={postTaxRef} className="mt-1 text-[11px] text-stone-500">
        {formatCurrency(initialPostTax)}
      </p>
      <p
        ref={qtyCueRef}
        className={cn("mt-0.5 text-[10px] leading-tight", pctCueClass(initialQtyPct))}
      >
        {formatPctVsL3m(initialQtyPct, "Qty")}
      </p>
      <p
        ref={netCueRef}
        className={cn("text-[10px] leading-tight", pctCueClass(initialNetPct))}
      >
        {formatPctVsL3m(initialNetPct, "Net")}
      </p>
    </td>
  );
});

function RspCell({
  skuCode,
  skuId,
  retailPrice,
  editable,
  onSave,
  onChangeExisting,
}: {
  skuCode: string;
  skuId: string;
  retailPrice: number | null;
  editable: boolean;
  onSave?: (skuId: string, next: number | null) => Promise<void>;
  onChangeExisting?: (skuId: string, skuCode: string, next: number) => void;
}) {
  const [value, setValue] = useState(
    retailPrice != null ? String(retailPrice) : "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(retailPrice != null ? String(retailPrice) : "");
  }, [retailPrice]);

  if (!editable || !onSave) {
    return (
      <td className="px-3 py-2.5">
        {retailPrice != null ? formatCurrency(retailPrice) : "—"}
      </td>
    );
  }

  const save = onSave;

  async function commit() {
    const trimmed = value.trim().replace(/,/g, "");
    let next: number | null;
    if (trimmed === "") {
      next = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) {
        setValue(retailPrice != null ? String(retailPrice) : "");
        return;
      }
      next = n;
    }
    if (next === retailPrice) return;
    if (
      next != null &&
      retailPrice != null &&
      retailPrice > 0 &&
      onChangeExisting
    ) {
      setValue(String(retailPrice));
      onChangeExisting(skuId, skuCode, next);
      return;
    }
    setSaving(true);
    try {
      await save(skuId, next);
    } catch {
      setValue(retailPrice != null ? String(retailPrice) : "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <td className="px-3 py-2.5">
      <input
        className={cn(CELL_INPUT_CLASS, "min-w-[5.5rem]")}
        value={value}
        disabled={saving}
        inputMode="decimal"
        placeholder="—"
        aria-label={`${skuCode} RSP`}
        title="Retail selling price (incl. VAT). Set this for NPDs so planned net can be calculated before any sales exist."
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </td>
  );
}

export const ForecastRow = memo(function ForecastRow({
  row,
  rowIndex,
  year,
  currentMonth,
  readOnly,
  highlight,
  combined,
  getDrafts,
  onDraft,
  onDraftSettle,
  registerRow,
  pendingInactive,
  onTogglePendingInactive,
  onSaveRsp,
  onChangeExistingRsp,
  liveVersion: _liveVersion,
}: {
  row: SopSkuRow;
  rowIndex: number;
  year: number;
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
  /** Staged for deactivation (not saved yet). */
  pendingInactive?: boolean;
  onTogglePendingInactive?: (skuId: string) => void;
  onSaveRsp?: (skuId: string, retailPrice: number | null) => Promise<void>;
  onChangeExistingRsp?: (
    skuId: string,
    skuCode: string,
    next: number,
  ) => void;
  /** Bumps memoized rows when plan drafts change so L3M deltas stay live. */
  liveVersion?: number;
}) {
  const shortfall = row.shortfall_qty;
  const bomComponents = row.bom_components ?? [];
  const missingRsp = hasMissingRsp(row);
  const lowCover = hasLowL3mCover(row);
  const stripe = rowStripeBg(rowIndex, {
    highlight,
    missingRsp,
    lowCover,
    warn: shortfall > 0,
  });
  const canStageInactive =
    Boolean(onTogglePendingInactive) && !combined && !readOnly;
  const progressRef = useRef<HTMLParagraphElement>(null);

  const bomLabel = bomComponents
    .map(
      (c) =>
        `${c.sku_code}×${
          Number.isInteger(c.qty_per_bundle)
            ? c.qty_per_bundle
            : formatNumber(c.qty_per_bundle, 2)
        }`,
    )
    .join(" · ");

  return (
    <tr
      ref={(el) => registerRow(row.sku_id, el)}
      className={cn(
        "border-t border-stone-200",
        stripe.row,
        pendingInactive ? "bg-amber-50/80" : null,
      )}
    >
      <td
        className={cn(
          freezeBody(FREEZE.id, stripe.freeze),
          "align-top font-medium text-stone-900",
        )}
      >
        <div className="flex items-start gap-2">
          {canStageInactive ? (
            <button
              type="button"
              className={cn(
                "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                pendingInactive
                  ? "border-amber-600 bg-amber-100 text-amber-900"
                  : "border-stone-300 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-700",
              )}
              title={
                pendingInactive
                  ? "Queued to mark inactive — click again to undo"
                  : "Queue this SKU to mark inactive for this channel"
              }
              aria-pressed={pendingInactive}
              aria-label={
                pendingInactive
                  ? `Undo queue inactive for ${row.sku_code}`
                  : `Queue ${row.sku_code} inactive`
              }
              onClick={() => onTogglePendingInactive?.(row.sku_id)}
            >
              {pendingInactive ? "Off" : "On"}
            </button>
          ) : null}
          <div className="min-w-0 flex-1 overflow-hidden">
            <span className="block break-all text-[13px] leading-snug">
              {row.sku_code}
            </span>
            {row.name ? (
              <span className="mt-0.5 block break-words text-xs font-normal leading-snug text-stone-500">
                {row.name}
              </span>
            ) : null}
            {row.is_bundle && bomComponents.length > 0 ? (
              <div
                className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] italic leading-snug text-stone-500"
                title={bomLabel}
              >
                {bomComponents.map((c, i) => {
                  const qty = Number.isInteger(c.qty_per_bundle)
                    ? String(c.qty_per_bundle)
                    : formatNumber(c.qty_per_bundle, 2);
                  return (
                    <span key={`${c.sku_code}-${i}`} className="inline">
                      <span className="break-all">{c.sku_code}</span>
                      <span className="not-italic">×{qty}</span>
                      {i < bomComponents.length - 1 ? (
                        <span className="text-stone-400"> ·</span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            ) : null}
            {row.is_npd ? (
              <Badge
                className="mt-1 bg-violet-100 text-violet-800"
                title="Fewer than 3 months with sales in the L3M window"
              >
                NPD ({row.l3m_months_with_sales}/3)
              </Badge>
            ) : null}
          </div>
        </div>
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
      <RspCell
        skuCode={row.sku_code}
        skuId={row.sku_id}
        retailPrice={row.retail_price}
        editable={!combined && !readOnly}
        onSave={onSaveRsp}
        onChangeExisting={onChangeExistingRsp}
      />
      <td className="px-3 py-2.5">{formatNumber(row.on_order_qty)}</td>
      <td className="px-3 py-2.5">{formatDateShort(row.projected_stockout_date)}</td>
      <td className="px-3 py-2.5">{formatCurrency(row.l3m_post_tax)}</td>
      <td className="px-3 py-2.5">{formatCurrency(row.l6m_post_tax)}</td>
      {MONTHS.map((month) => {
        const actual = row.months[month]?.actual;
        const plan = row.months[month]?.plan;
        const isCurrent = isCurrentCalendarMonth(year, month);
        const editable =
          !combined && isPlanMonth(month, currentMonth, readOnly);
        const monthRsp = rspForMonth(row, month);

        if (isCurrent) {
          const mtdQty = actual?.qty ?? 0;
          const mtdPostTax = actual?.post_tax_net ?? 0;
          const mtdDisc =
            actual?.avg_discount_pct ??
            impliedDiscountPct(mtdQty, monthRsp, mtdPostTax);
          const eomQty = eomProjectionFromMtd(mtdQty);
          const eomPostTax = eomProjectionFromMtd(mtdPostTax);
          const eomDisc =
            eomQty > 0
              ? impliedDiscountPct(eomQty, monthRsp, eomPostTax)
              : mtdDisc;

          const planQty = editable
            ? Number(getDrafts(row.sku_id, month, "qty") || 0) || 0
            : (plan?.projected_qty ?? 0);
          const planPostTax = editable
            ? livePostTax(
                getDrafts(row.sku_id, month, "qty"),
                getDrafts(row.sku_id, month, "disc"),
                monthRsp,
              )
            : (plan?.post_tax_net ?? 0);
          const planDisc = editable
            ? Number(getDrafts(row.sku_id, month, "disc") || 0) || null
            : (plan?.avg_discount_pct ?? null);
          const progress = eomVsForecastPct(eomPostTax, planPostTax);

          return (
            <CurrentMonthFragment
              key={month}
              skuCode={row.sku_code}
              skuId={row.sku_id}
              month={month}
              retailPrice={monthRsp}
              l3mQty={row.l3m_qty}
              l3mPostTax={row.l3m_post_tax}
              mtdQty={mtdQty}
              mtdPostTax={mtdPostTax}
              mtdDisc={mtdDisc}
              eomQty={eomQty}
              eomPostTax={eomPostTax}
              eomDisc={eomDisc}
              editable={editable}
              planQty={planQty}
              planPostTax={planPostTax}
              planDisc={planDisc}
              initialQty={getDrafts(row.sku_id, month, "qty")}
              initialDisc={getDrafts(row.sku_id, month, "disc")}
              warn={shortfall > 0}
              progress={progress}
              progressRef={progressRef}
              onDraft={onDraft}
              onDraftSettle={onDraftSettle}
            />
          );
        }

        if (!editable) {
          const usePlan = combined && isPlanMonth(month, currentMonth, false);
          const qty = usePlan ? (plan?.projected_qty ?? 0) : (actual?.qty ?? 0);
          const postTax = usePlan
            ? (plan?.post_tax_net ?? 0)
            : (actual?.post_tax_net ?? 0);
          const disc = usePlan
            ? (plan?.avg_discount_pct ?? null)
            : (actual?.avg_discount_pct ??
              impliedDiscountPct(qty, monthRsp, postTax));
          return (
            <ReadonlyMetricCell
              key={month}
              qty={qty}
              postTax={postTax}
              disc={disc}
            />
          );
        }
        return (
          <PlanMonthCell
            key={month}
            skuCode={row.sku_code}
            skuId={row.sku_id}
            month={month}
            retailPrice={monthRsp}
            l3mQty={row.l3m_qty}
            l3mPostTax={row.l3m_post_tax}
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

/** Four cells for the live calendar month: MTD · EOM · Plan · %. */
function CurrentMonthFragment({
  skuCode,
  skuId,
  month,
  retailPrice,
  l3mQty,
  l3mPostTax,
  mtdQty,
  mtdPostTax,
  mtdDisc,
  eomQty,
  eomPostTax,
  eomDisc,
  editable,
  planQty,
  planPostTax,
  planDisc,
  initialQty,
  initialDisc,
  warn,
  progress,
  progressRef,
  onDraft,
  onDraftSettle,
}: {
  skuCode: string;
  skuId: string;
  month: number;
  retailPrice: number | null;
  l3mQty: number;
  l3mPostTax: number;
  mtdQty: number;
  mtdPostTax: number;
  mtdDisc: number | null | undefined;
  eomQty: number;
  eomPostTax: number;
  eomDisc: number | null | undefined;
  editable: boolean;
  planQty: number;
  planPostTax: number;
  planDisc: number | null;
  initialQty: string;
  initialDisc: string;
  warn: boolean;
  progress: number | null;
  progressRef: RefObject<HTMLParagraphElement | null>;
  onDraft: (
    skuId: string,
    month: number,
    field: "qty" | "disc",
    value: string,
  ) => void;
  onDraftSettle: () => void;
}) {
  return (
    <>
      <ReadonlyMetricCell
        qty={mtdQty}
        postTax={mtdPostTax}
        disc={mtdDisc}
        className="bg-sky-50/60"
      />
      <ReadonlyMetricCell
        qty={eomQty}
        postTax={eomPostTax}
        disc={eomDisc}
        className="bg-sky-50/40"
        footer={
          <div className="mt-0.5 text-[10px] text-stone-400">run-rate</div>
        }
      />
      {editable ? (
        <PlanMonthCell
          skuCode={skuCode}
          skuId={skuId}
          month={month}
          retailPrice={retailPrice}
          l3mQty={l3mQty}
          l3mPostTax={l3mPostTax}
          initialQty={initialQty}
          initialDisc={initialDisc}
          warn={warn}
          onDraft={onDraft}
          onDraftSettle={onDraftSettle}
          eomPostTax={eomPostTax}
          progressRef={progressRef}
        />
      ) : (
        <ReadonlyMetricCell
          qty={planQty}
          postTax={planPostTax}
          disc={planDisc}
        />
      )}
      <td className="px-3 py-2.5 align-top">
        <p
          ref={progressRef}
          className={cn(
            "text-sm font-semibold tabular-nums",
            eomProgressClass(progress),
          )}
          title="EOM projected post-tax ÷ plan post-tax"
        >
          {formatEomProgress(progress)}
        </p>
        <div className="mt-0.5 text-[10px] text-stone-400">EOM vs plan</div>
      </td>
      <td
        className={cn(
          "bg-sky-50/30 px-3 py-2.5 tabular-nums",
          signedDeltaClass(planQty - l3mQty),
        )}
        title="Plan qty minus L3M monthly average"
      >
        {formatSignedNumber(planQty - l3mQty, 1)}
      </td>
      <td
        className={cn(
          "bg-sky-50/30 px-3 py-2.5 tabular-nums",
          signedDeltaClass(planPostTax - l3mPostTax),
        )}
        title="Plan post-tax minus L3M monthly average"
      >
        {planPostTax - l3mPostTax > 0
          ? `+${formatCurrency(planPostTax - l3mPostTax)}`
          : formatCurrency(planPostTax - l3mPostTax)}
      </td>
    </>
  );
}
