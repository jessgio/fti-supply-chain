"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { ExtractInboundDeliveryNoteLine } from "@/types/database";

export function DnHistoryExpandToggle({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      aria-label={label ?? (expanded ? "Collapse items" : "Expand items")}
      aria-expanded={expanded}
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
    </button>
  );
}

export function PackagingDnItemsNested({
  lines,
  colSpan,
}: {
  lines: Array<{
    item_code: string;
    product_name: string;
    cartons: number;
    pcs_per_carton: number;
    total_pcs?: number;
  }>;
  colSpan: number;
}) {
  return (
    <tr className="border-b border-stone-100 bg-stone-50/60">
      <td />
      <td colSpan={colSpan} className="py-2 pr-4">
        {lines.length === 0 ? (
          <p className="py-1 text-xs text-stone-500">No items on this delivery note.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-stone-400">
                <th className="py-1 pr-4 font-medium">Item code</th>
                <th className="py-1 pr-4 font-medium">Product</th>
                <th className="py-1 pr-4 text-right font-medium">Cartons</th>
                <th className="py-1 pr-4 text-right font-medium">Pcs / carton</th>
                <th className="py-1 text-right font-medium">Total pcs</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const totalPcs =
                  line.total_pcs ??
                  Number(line.cartons) * Number(line.pcs_per_carton);
                return (
                  <tr
                    key={`${line.item_code}-${index}`}
                    className="border-t border-stone-100 text-stone-700"
                  >
                    <td className="py-1.5 pr-4 font-mono">{line.item_code}</td>
                    <td className="py-1.5 pr-4">{line.product_name}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">
                      {formatNumber(line.cartons)}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">
                      {formatNumber(line.pcs_per_carton)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatNumber(totalPcs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

export function ExtractDnItemsNested({
  lines,
  colSpan,
}: {
  lines: Array<
    Pick<
      ExtractInboundDeliveryNoteLine,
      "item_code" | "extract_name" | "quantity" | "uom_kg" | "total_kg"
    >
  >;
  colSpan: number;
}) {
  return (
    <tr className="border-b border-stone-100 bg-stone-50/60">
      <td />
      <td colSpan={colSpan} className="py-2 pr-4">
        {lines.length === 0 ? (
          <p className="py-1 text-xs text-stone-500">No items on this delivery note.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-stone-400">
                <th className="py-1 pr-4 font-medium">Item code</th>
                <th className="py-1 pr-4 font-medium">Extract</th>
                <th className="py-1 pr-4 text-right font-medium">Quantity</th>
                <th className="py-1 pr-4 text-right font-medium">UOM (kg)</th>
                <th className="py-1 text-right font-medium">Total kg</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr
                  key={`${line.item_code}-${index}`}
                  className="border-t border-stone-100 text-stone-700"
                >
                  <td className="py-1.5 pr-4 font-mono">{line.item_code}</td>
                  <td className="py-1.5 pr-4">{line.extract_name}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {formatNumber(line.quantity)}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {formatNumber(line.uom_kg)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatNumber(line.total_kg)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}
