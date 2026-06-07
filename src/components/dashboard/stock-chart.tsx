"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RestockRecommendation } from "@/types/database";

interface StockChartProps {
  data: RestockRecommendation[];
  limit?: number;
}

export function StockChart({ data, limit = 12 }: StockChartProps) {
  const chartData = data.slice(0, limit).map((r) => ({
    sku: r.sku_code,
    stock: r.current_stock,
    onOrder: r.on_order_qty,
    reorder: Math.round(r.reorder_point),
    atRisk: r.current_stock < r.reorder_point,
  }));

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 24, right: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="sku"
            width={110}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Legend />
          <Bar dataKey="stock" name="On hand" stackId="a">
            {chartData.map((d) => (
              <Cell key={d.sku} fill={d.atRisk ? "#dc2626" : "#047857"} />
            ))}
          </Bar>
          <Bar dataKey="onOrder" name="On order" stackId="a" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
