"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPoMoney } from "@/lib/procurement/currencies";

export interface LastPurchaseCostHint {
  sku_id: string;
  currency: string;
  unit_cost: number;
  po_number: string | null;
  order_date: string | null;
  supplier_name: string | null;
}

/** Fetch last purchase costs for SKUs in a given currency. */
export function useLastPurchaseCosts(
  skuIds: string[],
  currency: string,
): {
  costsBySkuId: Map<string, LastPurchaseCostHint>;
  loading: boolean;
} {
  const [costsBySkuId, setCostsBySkuId] = useState<
    Map<string, LastPurchaseCostHint>
  >(new Map());
  const [loading, setLoading] = useState(false);

  const key = skuIds.filter(Boolean).sort().join(",");

  const load = useCallback(async () => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0 || !currency) {
      setCostsBySkuId(new Map());
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        sku_ids: ids.join(","),
        currency,
      });
      const res = await fetch(`/api/procurement/last-costs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load last costs");
      const next = new Map<string, LastPurchaseCostHint>();
      for (const row of data.costs ?? []) {
        next.set(String(row.sku_id), {
          sku_id: String(row.sku_id),
          currency: String(row.currency),
          unit_cost: Number(row.unit_cost),
          po_number: row.po_number ? String(row.po_number) : null,
          order_date: row.order_date ? String(row.order_date) : null,
          supplier_name: row.supplier_name ? String(row.supplier_name) : null,
        });
      }
      setCostsBySkuId(next);
    } catch {
      setCostsBySkuId(new Map());
    } finally {
      setLoading(false);
    }
  }, [key, currency]);

  useEffect(() => {
    void load();
  }, [load]);

  return { costsBySkuId, loading };
}

export function formatUnitCostInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  // Trim trailing zeros while keeping enough precision for PO costs.
  return String(Number(value.toFixed(5)));
}

export function LastPurchaseCostSuggestion({
  cost,
  currentUnitCost,
  onApply,
}: {
  cost: LastPurchaseCostHint | null | undefined;
  currentUnitCost: string;
  onApply: (unitCost: string) => void;
}) {
  if (!cost) return null;

  const alreadyMatches =
    currentUnitCost.trim() !== "" &&
    Number(currentUnitCost) === cost.unit_cost;

  const meta = [
    cost.po_number ? `PO ${cost.po_number}` : null,
    cost.order_date,
    cost.supplier_name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
      <span>
        Last: {formatPoMoney(cost.unit_cost, cost.currency)}
        {meta ? ` (${meta})` : ""}
      </span>
      {!alreadyMatches && (
        <button
          type="button"
          className="font-medium text-emerald-700 hover:underline"
          onClick={() => onApply(formatUnitCostInput(cost.unit_cost))}
        >
          Use
        </button>
      )}
    </div>
  );
}
