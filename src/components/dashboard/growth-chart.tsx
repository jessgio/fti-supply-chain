"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { FranchiseGrowthPoint, PeriodCoverage } from "@/types/database";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

export type ChartView = "total" | "franchise" | "stacked";

interface GrowthChartProps {
  data: FranchiseGrowthPoint[];
  metric?: "sales" | "qty";
  view?: ChartView;
  coverage?: PeriodCoverage | null;
}

const TOTAL_KEY = "__total";
const PROJECTED_TOTAL_KEY = "__total_projected";
const CHART_HEIGHT = 352;
const DEFAULT_CHART_WIDTH = 960;

const AXIS_TICK = { fontSize: 11, fill: "#57534e" };
const AXIS_LINE = { stroke: "#a8a29e" };

const ACTIVE_DOT = {
  r: 5,
  strokeWidth: 2,
  fill: "#fff",
};

const PALETTE = [
  "#047857",
  "#0ea5e9",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#ef4444",
  "#6366f1",
  "#84cc16",
  "#f97316",
];

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function formatAxisCompact(value: number, metric: "sales" | "qty"): string {
  const abs = Math.abs(value);
  if (metric === "sales") {
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return formatNumber(value);
  }
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return formatNumber(value);
}

function GrowthTooltip({
  active,
  payload,
  label,
  metric,
  coverage,
}: TooltipProps<number, string> & {
  metric: "sales" | "qty";
  coverage?: PeriodCoverage | null;
}) {
  if (!active || !payload?.length) return null;

  const formatValue = (v: number) =>
    metric === "sales" ? formatCurrency(v) : `${formatNumber(v)} units`;

  const rows = [...payload]
    .filter(
      (entry) =>
        entry.value !== undefined &&
        entry.value !== null &&
        entry.dataKey !== PROJECTED_TOTAL_KEY,
    )
    .sort((a, b) => Number(b.value) - Number(a.value));

  const projected = payload.find(
    (entry) => entry.dataKey === PROJECTED_TOTAL_KEY,
  );

  if (rows.length === 0 && !projected?.value) return null;

  const showProjected =
    coverage?.isPartial &&
    label === coverage.period &&
    projected?.value != null;

  return (
    <div className="pointer-events-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-stone-800">{label}</p>
      <ul className="space-y-1">
        {rows.map((entry) => {
          const name = entry.name ?? entry.dataKey ?? "";
          const displayName = name === TOTAL_KEY ? "Total (MTD)" : String(name);
          return (
            <li
              key={String(entry.dataKey ?? name)}
              className="flex items-center justify-between gap-6"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-stone-600">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color ?? "#78716c" }}
                />
                <span className="truncate">{displayName}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-stone-900">
                {formatValue(Number(entry.value))}
              </span>
            </li>
          );
        })}
        {showProjected && (
          <li className="flex items-center justify-between gap-6 border-t border-stone-100 pt-1">
            <span className="flex min-w-0 items-center gap-1.5 text-stone-600">
              <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-emerald-700 bg-emerald-50" />
              <span className="truncate">Projected EOM</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-emerald-800">
              {formatValue(Number(projected!.value))}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

function chartAxes(
  metric: "sales" | "qty",
  denseXAxis: boolean,
  coverage?: PeriodCoverage | null,
) {
  // Recharts + React 19: avoid Fragment wrappers as direct chart children.
  return [
    <CartesianGrid
      key="grid"
      strokeDasharray="3 3"
      stroke="#e7e5e4"
      vertical={false}
    />,
    <XAxis
      key="x"
      dataKey="period"
      tick={AXIS_TICK}
      axisLine={AXIS_LINE}
      tickLine={AXIS_LINE}
      interval="preserveStartEnd"
      minTickGap={20}
      angle={denseXAxis ? -35 : 0}
      textAnchor={denseXAxis ? "end" : "middle"}
      height={denseXAxis ? 56 : 36}
      dy={denseXAxis ? 4 : 8}
    />,
    <YAxis
      key="y"
      tick={AXIS_TICK}
      axisLine={AXIS_LINE}
      tickLine={AXIS_LINE}
      tickFormatter={(v) => formatAxisCompact(Number(v), metric)}
      width={64}
      tickCount={6}
    />,
    <Tooltip
      key="tooltip"
      content={({ active, payload, label }) => (
        <GrowthTooltip
          active={active}
          payload={payload as TooltipProps<number, string>["payload"]}
          label={label}
          metric={metric}
          coverage={coverage}
        />
      )}
      cursor={{ stroke: "#78716c", strokeWidth: 1, strokeDasharray: "4 4" }}
      isAnimationActive={false}
      wrapperStyle={{ zIndex: 20, outline: "none" }}
    />,
  ];
}

export function GrowthChart({
  data,
  metric = "sales",
  view = "total",
  coverage = null,
}: GrowthChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { ref, width } = useChartWidth();

  const { series, franchises } = useMemo(() => {
    const franchiseList = [...new Set(data.map((d) => d.franchise_name))].sort();
    const merged = new Map<string, Record<string, number | string | null>>();
    const scale =
      coverage?.isPartial && coverage.daysElapsed > 0
        ? coverage.daysInPeriod / coverage.daysElapsed
        : null;

    for (const d of data) {
      const value = metric === "sales" ? d.total_net_sales : d.total_qty;
      const row = merged.get(d.period) ?? { period: d.period };
      row[d.franchise_name] = Number(row[d.franchise_name] ?? 0) + value;
      merged.set(d.period, row);
    }
    const series = [...merged.values()]
      .map((row): Record<string, number | string | null> => {
        const total = franchiseList.reduce(
          (sum, name) => sum + Number(row[name] ?? 0),
          0,
        );
        const projectedTotal =
          scale != null &&
          coverage?.isPartial &&
          row.period === coverage.period
            ? total * scale
            : null;
        return {
          ...row,
          [TOTAL_KEY]: total,
          [PROJECTED_TOTAL_KEY]: projectedTotal,
        };
      })
      .sort((a, b) => String(a.period).localeCompare(String(b.period)));
    return { series, franchises: franchiseList };
  }, [data, metric, coverage]);

  const denseXAxis = series.length > 10;
  const chartMargin = {
    top: 12,
    right: 16,
    left: 0,
    bottom: denseXAxis ? 4 : 0,
  };

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const colorFor = (name: string) =>
    PALETTE[franchises.indexOf(name) % PALETTE.length];

  const axes = chartAxes(metric, denseXAxis, coverage);

  const chartBody =
    view === "total" ? (
      <ComposedChart
        width={width}
        height={CHART_HEIGHT}
        data={series}
        margin={chartMargin}
      >
        {axes}
        <defs>
          <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#047857" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#047857" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={TOTAL_KEY}
          name="Total (MTD)"
          stroke="#047857"
          strokeWidth={2.5}
          fill="url(#totalFill)"
          dot={false}
          activeDot={ACTIVE_DOT}
        />
        {coverage?.isPartial && (
          <Line
            type="monotone"
            dataKey={PROJECTED_TOTAL_KEY}
            name="Projected EOM"
            stroke="#047857"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 4, strokeWidth: 2, fill: "#ecfdf5" }}
            connectNulls={false}
            activeDot={ACTIVE_DOT}
          />
        )}
      </ComposedChart>
    ) : view === "stacked" ? (
      <AreaChart
        width={width}
        height={CHART_HEIGHT}
        data={series}
        margin={chartMargin}
      >
        {axes}
        {franchises.map((name) => (
          <Area
            key={name}
            type="monotone"
            dataKey={name}
            stackId="all"
            stroke={colorFor(name)}
            fill={colorFor(name)}
            fillOpacity={0.55}
            hide={hidden.has(name)}
            dot={false}
            activeDot={ACTIVE_DOT}
          />
        ))}
      </AreaChart>
    ) : (
      <LineChart
        width={width}
        height={CHART_HEIGHT}
        data={series}
        margin={chartMargin}
      >
        {axes}
        {franchises.map((name) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={colorFor(name)}
            strokeWidth={2}
            hide={hidden.has(name)}
            dot={false}
            activeDot={ACTIVE_DOT}
          />
        ))}
      </LineChart>
    );

  return (
    <div className="space-y-3">
      <div
        ref={ref}
        className="w-full min-w-0 overflow-x-auto"
        style={{ height: CHART_HEIGHT }}
      >
        {chartBody}
      </div>

      {coverage?.isPartial && view === "total" && (
        <p className="text-xs text-stone-500">
          Dashed line projects period-end from the MTD run rate (
          {coverage.daysElapsed} of {coverage.daysInPeriod} days reported).
        </p>
      )}

      {view !== "total" && franchises.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {franchises.map((name) => {
            const isHidden = hidden.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  isHidden
                    ? "border-stone-200 bg-stone-50 text-stone-400"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: isHidden ? "#d6d3d1" : colorFor(name),
                  }}
                />
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
