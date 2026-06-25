"use client";

import { useMemo } from "react";
import {
  buildPdGanttBars,
  formatPdDate,
  getPdBarStyle,
  getPdGanttPosition,
  PD_GANTT_PHASE_STYLES,
  PD_PHASE_STATUS_LABELS,
} from "@/lib/product-development/gantt";
import type { PdGanttBar, PdPhaseDetail, PdPhaseLink } from "@/types/database";

interface PdGanttProps {
  phases: PdPhaseDetail[];
  links?: PdPhaseLink[];
}

function PdGanttRow({
  bar,
  rangeStart,
  rangeEnd,
  todayPosition,
}: {
  bar: PdGanttBar;
  rangeStart: Date;
  rangeEnd: Date;
  todayPosition: number | null;
}) {
  const style = getPdBarStyle(bar.start, bar.end, rangeStart, rangeEnd);

  return (
    <div
      className="grid items-start gap-3"
      style={{ gridTemplateColumns: "10rem minmax(0, 1fr) 11rem" }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-stone-900">{bar.label}</p>
        {bar.dependsOnLabel && (
          <p className="truncate text-xs text-stone-500">
            After {bar.dependsOnLabel}
            {bar.isShifted ? " · shifted" : ""}
          </p>
        )}
        {bar.picNames.length > 0 && (
          <p className="truncate text-xs text-stone-400">
            PIC: {bar.picNames.join(", ")}
          </p>
        )}
      </div>
      <div className="relative pb-4">
        <div className="relative h-8 rounded-md bg-stone-100/80">
          {todayPosition != null && (
            <div
              className="absolute inset-y-0 z-10 w-px bg-rose-600"
              style={{ left: `${todayPosition}%` }}
            />
          )}
          <div
            className={`absolute inset-y-1 rounded-md ${PD_GANTT_PHASE_STYLES[bar.status]}`}
            style={{ left: `${style.left}%`, width: `${style.width}%` }}
            title={`${formatPdDate(bar.start)} – ${formatPdDate(bar.end)}`}
          />
        </div>
      </div>
      <div className="text-right text-xs">
        <p className="font-medium text-stone-700">
          {PD_PHASE_STATUS_LABELS[bar.status]}
        </p>
        <p className="tabular-nums text-stone-500">
          {formatPdDate(bar.start)} – {formatPdDate(bar.end)}
        </p>
      </div>
    </div>
  );
}

export function PdGantt({ phases, links = [] }: PdGanttProps) {
  const chart = useMemo(() => {
    const bars = buildPdGanttBars(phases, links);
    if (bars.length === 0) return null;

    const datePoints = bars.flatMap((b) => [b.start, b.end]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    datePoints.push(today);

    let rangeStart = new Date(Math.min(...datePoints.map((d) => d.getTime())));
    let rangeEnd = new Date(Math.max(...datePoints.map((d) => d.getTime())));
    const rangeMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), 86_400_000);
    const padMs = Math.max(rangeMs * 0.06, 2 * 86_400_000);
    rangeStart = new Date(rangeStart.getTime() - padMs);
    rangeEnd = new Date(rangeEnd.getTime() + padMs);

    const tickCount = 5;
    const span = rangeEnd.getTime() - rangeStart.getTime();
    const ticks: Date[] = [];
    for (let i = 0; i <= tickCount; i += 1) {
      ticks.push(new Date(rangeStart.getTime() + (span * i) / tickCount));
    }

    const todayPosition = getPdGanttPosition(today, rangeStart, rangeEnd);
    return { bars, rangeStart, rangeEnd, today, ticks, todayPosition };
  }, [phases, links]);

  if (!chart) {
    return (
      <p className="rounded-md border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-500">
        Add phase start dates to see the project timeline. Dependent phases will
        shift automatically when earlier phases are delayed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "10rem minmax(0, 1fr) 11rem" }}
      >
        <div />
        <div className="relative h-5 border-b border-stone-200">
          {chart.ticks.map((tick) => {
            const pos = getPdGanttPosition(tick, chart.rangeStart, chart.rangeEnd);
            if (pos == null) return null;
            return (
              <span
                key={tick.toISOString()}
                className="absolute top-0 whitespace-nowrap text-[11px] tabular-nums text-stone-500"
                style={{
                  left: `${pos}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {formatPdDate(tick)}
              </span>
            );
          })}
        </div>
        <div />
      </div>
      {chart.bars.map((bar) => (
        <PdGanttRow
          key={bar.phaseId}
          bar={bar}
          rangeStart={chart.rangeStart}
          rangeEnd={chart.rangeEnd}
          todayPosition={chart.todayPosition}
        />
      ))}
    </div>
  );
}
