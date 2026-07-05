"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildFranchiseShareData } from "@/lib/analytics/product-contribution";
import type {
  ContributionWindow,
  FranchiseProductContribution,
} from "@/types/database";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

const DEFAULT_CHART_WIDTH = 960;

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

interface ProductContributionChartProps {
  rows: FranchiseProductContribution[];
  window: ContributionWindow;
  metric: "sales" | "qty";
}

function formatShare(value: number): string {
  return `${value.toFixed(1)}%`;
}

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

export function ProductContributionChart({
  rows,
  window,
  metric,
}: ProductContributionChartProps) {
  const { rows: chartRows, grandTotal } = useMemo(
    () => buildFranchiseShareData(rows, window, metric),
    [rows, window, metric],
  );
  const { ref, width } = useChartWidth();

  const barHeight = 32;
  const chartHeight = Math.max(240, chartRows.length * barHeight + 48);
  const maxShare = chartRows[0]?.share_pct ?? 100;

  if (chartRows.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No sales in this period for the selected filters.
      </p>
    );
  }

  return (
    <div ref={ref} className="w-full">
      <div style={{ height: chartHeight }}>
        <BarChart
          width={width}
          height={chartHeight}
          data={chartRows}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
          barCategoryGap={10}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e7e5e4"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, Math.ceil(maxShare * 1.1)]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "#57534e" }}
            axisLine={{ stroke: "#a8a29e" }}
          />
          <YAxis
            type="category"
            dataKey="franchise_name"
            width={200}
            tick={{ fontSize: 11, fill: "#57534e" }}
            axisLine={{ stroke: "#a8a29e" }}
          />
          <Tooltip
            formatter={(value: number, _name, item) => {
              const row = item.payload as {
                value: number;
                share_pct: number;
              };
              return [
                metric === "sales"
                  ? `${formatCurrency(row.value)} (${formatShare(value)})`
                  : `${formatNumber(row.value)} units (${formatShare(value)})`,
                "Share of total",
              ];
            }}
            labelFormatter={(label) => String(label)}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="share_pct" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {chartRows.map((_, index) => (
              <Cell
                key={chartRows[index].franchise_name}
                fill={PALETTE[index % PALETTE.length]}
              />
            ))}
            <LabelList
              dataKey="share_pct"
              position="right"
              formatter={(value: number) => formatShare(value)}
              style={{ fill: "#44403c", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        Each bar is that franchise&apos;s share of total{" "}
        {metric === "sales" ? "net sales" : "quantity"} (
        {metric === "sales"
          ? formatCurrency(grandTotal)
          : `${formatNumber(grandTotal)} units`}
        ). Sorted largest first.
      </p>
    </div>
  );
}

export function ContributionWindowToggle({
  window,
  onChange,
  className,
}: {
  window: ContributionWindow;
  onChange: (window: ContributionWindow) => void;
  className?: string;
}) {
  const options: { id: ContributionWindow; label: string }[] = [
    { id: "mtd", label: "MTD" },
    { id: "ytd", label: "YTD" },
  ];

  return (
    <div className={cn("flex gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            window === opt.id
              ? "bg-emerald-700 text-white"
              : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
