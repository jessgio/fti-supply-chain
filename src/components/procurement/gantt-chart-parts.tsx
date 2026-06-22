"use client";

import Link from "next/link";
import {
  formatPoGanttDate,
  formatPoGanttMilestoneLabel,
  formatPoGanttRange,
  getGanttMarkerAlign,
  getPoGanttBarEndPosition,
  getPoGanttBarStyle,
  getPoGanttPosition,
  shouldHideGanttTickLabel,
  type PoGanttBar,
} from "@/lib/procurement/po-timeline-gantt";

export const PHASE_STYLES: Record<PoGanttBar["phase"], string> = {
  production: "bg-amber-500/85",
  shipping: "bg-stone-700/85",
};

export const DELAY_BAR_STYLE = "bg-rose-500/90";

const PHASE_MILESTONE_STYLES: Record<PoGanttBar["phase"], string> = {
  production: "border-amber-500/40 bg-amber-50 text-amber-900",
  shipping: "border-stone-500/40 bg-stone-100 text-stone-800",
};

const DELAY_MILESTONE_STYLE =
  "border-rose-500/40 bg-rose-50 text-rose-900";

const PHASE_END_CAP_STYLES: Record<PoGanttBar["phase"], string> = {
  production: "bg-amber-600",
  shipping: "bg-stone-800",
};

const DELAY_END_CAP_STYLE = "bg-rose-600";

export function GanttLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-500">
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-6 rounded-sm bg-amber-500/85" aria-hidden />
        Production
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-6 rounded-sm bg-stone-700/85" aria-hidden />
        Shipping
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="flex h-2.5 w-6 overflow-hidden rounded-sm" aria-hidden>
          <span className="h-full flex-1 bg-stone-700/85" />
          <span className="h-full flex-1 bg-rose-500/90" />
        </span>
        Delay
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-px bg-rose-600" aria-hidden />
        <span className="rounded-full border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 shadow-sm">
          Today
        </span>
      </span>
    </div>
  );
}

export function GanttAxis({
  ticks,
  rangeStart,
  rangeEnd,
  today,
  labelWidth,
  dateWidth,
  todayPosition,
}: {
  ticks: Date[];
  rangeStart: Date;
  rangeEnd: Date;
  today: Date;
  labelWidth: string;
  dateWidth: string;
  todayPosition?: number | null;
}) {
  return (
    <div
      className="hidden gap-3 sm:grid"
      style={{ gridTemplateColumns: `${labelWidth} minmax(0, 1fr) ${dateWidth}` }}
    >
      <div aria-hidden />
      <div className="relative">
        {todayPosition != null ? (
          <div className="relative mb-1 h-6">
            <div
              className="absolute bottom-0 z-20 max-w-[min(100%,11rem)]"
              style={{
                left: `${todayPosition}%`,
                transform: getGanttMarkerAlign(todayPosition),
              }}
            >
              <span className="block whitespace-nowrap rounded-full border border-rose-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 shadow-sm">
                Today · {formatPoGanttDate(today)}
              </span>
            </div>
          </div>
        ) : null}
        <div className="relative h-5 border-b border-stone-200">
          {ticks.map((tick) => {
            const tickPosition = getPoGanttPosition(tick, rangeStart, rangeEnd);
            if (tickPosition == null) return null;
            if (shouldHideGanttTickLabel(tickPosition, todayPosition ?? null))
              return null;

            return (
              <span
                key={tick.toISOString()}
                className="absolute top-0 whitespace-nowrap text-[11px] tabular-nums text-stone-500"
                style={{
                  left: `${tickPosition}%`,
                  transform: getGanttMarkerAlign(tickPosition),
                }}
              >
                {formatPoGanttDate(tick)}
              </span>
            );
          })}
        </div>
      </div>
      <div aria-hidden />
    </div>
  );
}

export function GanttRow({
  bar,
  rangeStart,
  rangeEnd,
  todayPosition,
  labelWidth,
  dateWidth,
  shipmentHref,
  shipmentDetail,
}: {
  bar: PoGanttBar;
  rangeStart: Date;
  rangeEnd: Date;
  todayPosition: number | null;
  labelWidth: string;
  dateWidth: string;
  shipmentHref?: string;
  shipmentDetail?: string;
}) {
  const hasDelay = bar.phase === "shipping" && bar.delayStart != null;
  const mainStyle = getPoGanttBarStyle(
    bar,
    rangeStart,
    rangeEnd,
    hasDelay ? "main" : "full",
  );
  const delayStyle = hasDelay
    ? getPoGanttBarStyle(bar, rangeStart, rangeEnd, "delay")
    : null;
  const showMain = mainStyle.width > 0;
  const showDelay = delayStyle != null && delayStyle.width > 0;
  const endPosition = getPoGanttBarEndPosition(bar, rangeStart, rangeEnd);
  const endCapStyle =
    bar.phase === "shipping" && showDelay
      ? DELAY_END_CAP_STYLE
      : PHASE_END_CAP_STYLES[bar.phase];
  const endMilestoneStyle =
    bar.phase === "shipping" && showDelay
      ? DELAY_MILESTONE_STYLE
      : PHASE_MILESTONE_STYLES[bar.phase];

  const label = (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-stone-900">{bar.label}</p>
      {(bar.detail || shipmentDetail) && (
        <p className="truncate text-xs text-stone-500">
          {bar.detail ?? shipmentDetail}
        </p>
      )}
    </div>
  );

  const track = (
    <div className="relative pb-6">
      <div className="relative h-9 rounded-md bg-stone-100/80">
        {todayPosition != null ? (
          <div
            className="absolute inset-y-0 z-10 w-px bg-rose-600"
            style={{ left: `${todayPosition}%` }}
          />
        ) : null}
        {showMain ? (
          <div
            className={`absolute inset-y-1 ${showDelay ? "rounded-l-md" : "rounded-md"} ${PHASE_STYLES[bar.phase]}`}
            style={{ left: `${mainStyle.left}%`, width: `${mainStyle.width}%` }}
            title={formatPoGanttRange(bar.start, bar.delayStart ?? bar.end)}
          />
        ) : null}
        {showDelay ? (
          <div
            className={`absolute inset-y-1 ${showMain ? "rounded-r-md" : "rounded-md"} ${DELAY_BAR_STYLE}`}
            style={{ left: `${delayStyle.left}%`, width: `${delayStyle.width}%` }}
            title={`Delay · ${formatPoGanttRange(bar.delayStart!, bar.end)}`}
          />
        ) : null}
        {endPosition != null ? (
          <>
            <div
              className={`absolute top-1 bottom-1 z-20 w-0.5 ${endCapStyle}`}
              style={{ left: `${endPosition}%`, transform: "translateX(-50%)" }}
              aria-hidden
            />
            <div
              className="absolute top-full z-20 mt-1 hidden max-w-[10.5rem] sm:block"
              style={{
                left: `${endPosition}%`,
                transform: getGanttMarkerAlign(endPosition),
              }}
            >
              <span
                className={`block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm ${endMilestoneStyle}`}
              >
                {formatPoGanttMilestoneLabel(bar.endMarkerLabel, bar.end)}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  const dateColumn = (
    <div className="text-xs sm:text-right">
      <p
        className={`font-semibold leading-tight ${
          bar.phase === "production"
            ? "text-amber-800"
            : showDelay
              ? "text-rose-800"
              : "text-stone-800"
        }`}
      >
        {bar.endMarkerLabel}
      </p>
      <p className="mt-0.5 tabular-nums font-medium text-stone-900">
        {formatPoGanttDate(bar.end)}
      </p>
      <p className="mt-1 tabular-nums text-[11px] text-stone-500">
        <span className="font-medium">{bar.startMarkerLabel}</span>{" "}
        {formatPoGanttDate(bar.start)} – {formatPoGanttDate(bar.end)}
      </p>
    </div>
  );

  return (
    <>
      <div
        className="hidden sm:grid sm:items-start sm:gap-3"
        style={{
          gridTemplateColumns: `${labelWidth} minmax(0, 1fr) ${dateWidth}`,
        }}
      >
        {shipmentHref ? (
          <Link href={shipmentHref} className="min-w-0 hover:underline">
            {label}
          </Link>
        ) : (
          <div className="min-w-0">{label}</div>
        )}
        {track}
        {dateColumn}
      </div>

      <div className="space-y-2 sm:hidden">
        {shipmentHref ? (
          <Link href={shipmentHref} className="min-w-0 hover:underline">
            {label}
          </Link>
        ) : (
          <div className="min-w-0">{label}</div>
        )}
        {track}
        {dateColumn}
      </div>
    </>
  );
}
