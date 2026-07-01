"use client";

import { useMemo } from "react";
import {
  formatTimelineDate,
  getBarStyle,
  getGanttPosition,
  type TimelineSchedule,
} from "@/lib/timeline-adjustment/schedule";
import { cn } from "@/lib/utils";

const GANTT_GRID_COLUMNS =
  "minmax(11rem, 34%) minmax(12rem, 1fr) minmax(7rem, auto)";

const ganttGridStyle = { gridTemplateColumns: GANTT_GRID_COLUMNS } as const;

const MS_PER_DAY = 86_400_000;

const PROCESS_BAR_STYLES: Record<string, string> = {
  primary_packaging: "bg-amber-500/90",
  secondary_packaging: "bg-sky-500/90",
  extract: "bg-violet-500/90",
  send_to_manufacturer: "bg-stone-600/90",
  manufacturer_filling: "bg-emerald-600/90",
  warehouse_delivery: "bg-emerald-800 ring-2 ring-emerald-900/20",
};

interface TimelineAdjustmentGanttProps {
  schedule: TimelineSchedule;
}

function GanttRow({
  processId,
  label,
  parallel,
  start,
  end,
  leadTimeDays,
  rangeStart,
  rangeEnd,
  todayPosition,
}: {
  processId: string;
  label: string;
  parallel: boolean;
  start: Date;
  end: Date;
  leadTimeDays: number;
  rangeStart: Date;
  rangeEnd: Date;
  todayPosition: number | null;
}) {
  const style = getBarStyle(start, end, rangeStart, rangeEnd);
  const barStyle = PROCESS_BAR_STYLES[processId] ?? "bg-stone-500/90";
  const isMilestone = processId === "warehouse_delivery";

  return (
    <div className="grid w-full items-center gap-x-3 py-2.5" style={ganttGridStyle}>
      <div className="min-w-0">
        <p className="break-words text-sm font-medium leading-snug text-stone-900">
          {label}
        </p>
        {parallel && (
          <p className="text-xs text-stone-500">Runs in parallel</p>
        )}
        <p className="text-xs text-stone-400">{leadTimeDays} day lead time</p>
      </div>
      <div className="relative min-w-0 self-center">
        <div className="relative h-7 w-full rounded-md bg-stone-100/80">
          {todayPosition != null && (
            <div
              className="absolute inset-y-0 z-10 w-px bg-rose-600"
              style={{ left: `${todayPosition}%` }}
            />
          )}
          <div
            className={cn(
              "absolute inset-y-1 rounded-sm",
              barStyle,
              isMilestone && "inset-y-2",
            )}
            style={{ left: `${style.left}%`, width: `${style.width}%` }}
            title={`${formatTimelineDate(start)} – ${formatTimelineDate(end)}`}
          />
        </div>
      </div>
      <div className="min-w-0 self-center text-right text-xs leading-snug">
        <p className="font-medium tabular-nums text-stone-700">
          {formatTimelineDate(start)}
        </p>
        <p className="tabular-nums text-stone-500">→ {formatTimelineDate(end)}</p>
      </div>
    </div>
  );
}

export function TimelineAdjustmentGantt({ schedule }: TimelineAdjustmentGanttProps) {
  const chart = useMemo(() => {
    const datePoints = schedule.processes.flatMap((p) => [p.start, p.end]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    datePoints.push(today);

    let rangeStart = new Date(Math.min(...datePoints.map((d) => d.getTime())));
    let rangeEnd = new Date(Math.max(...datePoints.map((d) => d.getTime())));
    const rangeMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), MS_PER_DAY);
    const padMs = Math.max(rangeMs * 0.06, 2 * MS_PER_DAY);
    rangeStart = new Date(rangeStart.getTime() - padMs);
    rangeEnd = new Date(rangeEnd.getTime() + padMs);

    const tickCount = 5;
    const span = rangeEnd.getTime() - rangeStart.getTime();
    const ticks: Date[] = [];
    for (let i = 0; i <= tickCount; i += 1) {
      ticks.push(new Date(rangeStart.getTime() + (span * i) / tickCount));
    }

    const todayPosition = getGanttPosition(today, rangeStart, rangeEnd);

    return { rangeStart, rangeEnd, today, ticks, todayPosition };
  }, [schedule]);

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-sm bg-amber-500/90" aria-hidden />
          Primary packaging
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-sm bg-sky-500/90" aria-hidden />
          Secondary packaging
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-sm bg-violet-500/90" aria-hidden />
          Extract
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-sm bg-stone-600/90" aria-hidden />
          Send to manufacturer
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-sm bg-emerald-600/90" aria-hidden />
          Manufacturer filling
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-px bg-rose-600" aria-hidden />
          Today
        </span>
      </div>

      <div className="w-full min-w-0 overflow-x-auto">
        <div className="min-w-[34rem] space-y-1">
          <div className="grid w-full items-end gap-x-3" style={ganttGridStyle}>
            <div />
            <div className="relative h-5 min-w-0 border-b border-stone-200">
              {chart.ticks.map((tick) => {
                const pos = getGanttPosition(tick, chart.rangeStart, chart.rangeEnd);
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
                    {formatTimelineDate(tick)}
                  </span>
                );
              })}
            </div>
            <div />
          </div>

          <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white px-3">
            {schedule.processes.map((process) => (
              <GanttRow
                key={process.id}
                processId={process.id}
                label={process.label}
                parallel={process.parallel}
                start={process.start}
                end={process.end}
                leadTimeDays={process.leadTimeDays}
                rangeStart={chart.rangeStart}
                rangeEnd={chart.rangeEnd}
                todayPosition={chart.todayPosition}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
