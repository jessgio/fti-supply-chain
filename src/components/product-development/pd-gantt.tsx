"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  buildPdGanttBars,
  formatPdDate,
  getPdBarStyle,
  getPdGanttPosition,
  PD_GANTT_PHASE_STYLES,
  PD_PHASE_STATUS_LABELS,
} from "@/lib/product-development/gantt";
import { cn } from "@/lib/utils";
import { resolveNpdConfirmationStartDate } from "@/lib/product-development/npd-confirmation-schedule";
import type { PdGanttBar, PdPhaseDetail, PdPhaseLink } from "@/types/database";

/**
 * Labels: up to 38% of container (wrap inside); chart: remaining space with a
 * sensible floor; dates: content-sized. All columns scale with viewport width.
 */
const GANTT_GRID_COLUMNS =
  "minmax(10rem, 38%) minmax(12rem, 1fr) minmax(6rem, auto)";

const ganttGridStyle = { gridTemplateColumns: GANTT_GRID_COLUMNS } as const;

interface PdGanttProps {
  phases: PdPhaseDetail[];
  links?: PdPhaseLink[];
  npdConfirmationStartDate?: string | null;
}

interface GanttGroup {
  header: PdGanttBar;
  children: PdGanttBar[];
}

function groupGanttBars(bars: PdGanttBar[]): {
  groups: GanttGroup[];
  standalone: PdGanttBar[];
} {
  const groups: GanttGroup[] = [];
  const standalone: PdGanttBar[] = [];
  const groupByHeaderId = new Map<string, GanttGroup>();

  for (const bar of bars) {
    if (bar.isHeader) {
      const group = { header: bar, children: [] };
      groups.push(group);
      groupByHeaderId.set(bar.phaseId, group);
      continue;
    }
    if (bar.parentPhaseId) {
      const group = groupByHeaderId.get(bar.parentPhaseId);
      if (group) {
        group.children.push(bar);
        continue;
      }
    }
    standalone.push(bar);
  }

  return { groups, standalone };
}

function PdGanttRow({
  bar,
  rangeStart,
  rangeEnd,
  todayPosition,
  variant = "default",
  expanded,
  onToggleExpand,
  className,
}: {
  bar: PdGanttBar;
  rangeStart: Date;
  rangeEnd: Date;
  todayPosition: number | null;
  variant?: "header" | "child" | "default";
  expanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}) {
  const style = getPdBarStyle(bar.start, bar.end, rangeStart, rangeEnd);
  const isHeader = variant === "header";
  const isChild = variant === "child";
  const canExpand = isHeader && bar.childCount > 0 && onToggleExpand;

  return (
    <div
      className={cn("grid w-full items-center gap-x-3", className)}
      style={ganttGridStyle}
    >
      <div className={cn("min-w-0", isChild && "pl-4")}>
        <div className="flex items-start gap-1">
          {canExpand ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="mt-0.5 shrink-0 rounded p-0.5 text-stone-500 hover:bg-stone-200/60 hover:text-stone-800"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse sub-tasks" : "Expand sub-tasks"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : isHeader ? (
            <span className="w-5 shrink-0" aria-hidden />
          ) : null}
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "break-words leading-snug text-sm text-stone-900",
                isHeader ? "font-semibold" : isChild ? "font-normal" : "font-medium",
              )}
            >
              {bar.label}
            </p>
            {bar.dependsOnLabel && (
              <p className="break-words leading-snug text-xs text-stone-500">
                After {bar.dependsOnLabel}
                {bar.isShifted ? " · shifted" : ""}
              </p>
            )}
            {bar.picNames.length > 0 && (
              <p className="break-words leading-snug text-xs text-stone-400">
                PIC: {bar.picNames.join(", ")}
              </p>
            )}
            {isHeader && bar.childCount > 0 && (
              <p className="leading-snug text-xs text-emerald-700/80">
                {bar.childCount} sub-task{bar.childCount === 1 ? "" : "s"}
                {!expanded ? " · collapsed" : ""}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="relative min-w-0 self-center">
        <div
          className={cn(
            "relative w-full rounded-md",
            isHeader ? "h-7 bg-emerald-100/70" : "h-6 bg-stone-100/80",
          )}
        >
          {todayPosition != null && (
            <div
              className="absolute inset-y-0 z-10 w-px bg-rose-600"
              style={{ left: `${todayPosition}%` }}
            />
          )}
          <div
            className={cn(
              "absolute inset-y-1 rounded-sm",
              PD_GANTT_PHASE_STYLES[bar.status],
              isHeader && "ring-1 ring-emerald-800/15",
            )}
            style={{ left: `${style.left}%`, width: `${style.width}%` }}
            title={`${formatPdDate(bar.start)} – ${formatPdDate(bar.end)}`}
          />
        </div>
      </div>
      <div className="min-w-0 self-center text-right text-xs leading-snug">
        <p className={cn("font-medium text-stone-700", isHeader && "font-semibold")}>
          {PD_PHASE_STATUS_LABELS[bar.status]}
        </p>
        <p className="break-words tabular-nums text-stone-500">
          {formatPdDate(bar.start)} – {formatPdDate(bar.end)}
        </p>
      </div>
    </div>
  );
}

function PdGanttGroup({
  group,
  rangeStart,
  rangeEnd,
  todayPosition,
  expanded,
  onToggleExpand,
}: {
  group: GanttGroup;
  rangeStart: Date;
  rangeEnd: Date;
  todayPosition: number | null;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const hasChildren = group.children.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-emerald-200/90 bg-emerald-50/40 shadow-sm">
      <div
        className={cn(
          "px-3 py-2.5",
          hasChildren && expanded && "border-b border-emerald-200/70",
        )}
      >
        <PdGanttRow
          bar={group.header}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          todayPosition={todayPosition}
          variant="header"
          expanded={expanded}
          onToggleExpand={hasChildren ? onToggleExpand : undefined}
        />
      </div>
      {hasChildren && expanded && (
        <div className="divide-y divide-emerald-100/90 bg-white/50">
          {group.children.map((child) => (
            <div key={child.phaseId} className="px-3 py-2.5">
              <PdGanttRow
                bar={child}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                todayPosition={todayPosition}
                variant="child"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PdGantt({
  phases,
  links = [],
  npdConfirmationStartDate,
}: PdGanttProps) {
  const npdStart = resolveNpdConfirmationStartDate(npdConfirmationStartDate);
  const scheduleOptions = useMemo(
    () => ({ npdConfirmationStartDate: npdStart }),
    [npdStart],
  );

  const [collapsedHeaders, setCollapsedHeaders] = useState<Set<string>>(
    () => new Set(),
  );

  const chart = useMemo(() => {
    const bars = buildPdGanttBars(phases, links, scheduleOptions);
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
    const { groups, standalone } = groupGanttBars(bars);
    return { bars, groups, standalone, rangeStart, rangeEnd, today, ticks, todayPosition };
  }, [phases, links, scheduleOptions]);

  function toggleHeader(headerId: string) {
    setCollapsedHeaders((prev) => {
      const next = new Set(prev);
      if (next.has(headerId)) next.delete(headerId);
      else next.add(headerId);
      return next;
    });
  }

  if (!chart) {
    return (
      <p className="rounded-md border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-500">
        Add phase start dates to see the project timeline. Dependent phases will
        shift automatically when earlier phases are delayed.
      </p>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <div className="min-w-[34rem] space-y-4">
      <div className="grid w-full items-end gap-x-3" style={ganttGridStyle}>
        <div />
        <div className="relative h-5 min-w-0 border-b border-stone-200">
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
      {chart.groups.map((group) => (
        <PdGanttGroup
          key={group.header.phaseId}
          group={group}
          rangeStart={chart.rangeStart}
          rangeEnd={chart.rangeEnd}
          todayPosition={chart.todayPosition}
          expanded={!collapsedHeaders.has(group.header.phaseId)}
          onToggleExpand={() => toggleHeader(group.header.phaseId)}
        />
      ))}
      {chart.standalone.map((bar) => (
        <div key={bar.phaseId} className="px-1 py-1">
          <PdGanttRow
            bar={bar}
            rangeStart={chart.rangeStart}
            rangeEnd={chart.rangeEnd}
            todayPosition={chart.todayPosition}
          />
        </div>
      ))}
      </div>
    </div>
  );
}
