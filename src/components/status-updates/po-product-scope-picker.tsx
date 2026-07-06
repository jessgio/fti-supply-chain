"use client";

import { cn } from "@/lib/utils";
import { SkuProductLabel } from "@/components/status-updates/sku-product-label";
import type { StatusUpdatePoProduct } from "@/types/database";

export type PoProductScopeMode = "all" | "selected";

interface PoProductScopePickerProps {
  products: StatusUpdatePoProduct[];
  mode: PoProductScopeMode;
  onModeChange: (mode: PoProductScopeMode) => void;
  selectedSkuIds: string[];
  onToggleSku: (skuId: string) => void;
  currentSkuId?: string;
  disabled?: boolean;
}

export function PoProductScopePicker({
  products,
  mode,
  onModeChange,
  selectedSkuIds,
  onToggleSku,
  currentSkuId,
  disabled = false,
}: PoProductScopePickerProps) {
  if (products.length <= 1) return null;

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div>
        <p className="text-sm font-medium text-stone-800">Product scope</p>
        <p className="text-xs text-stone-500">
          This PO contains {products.length} products. Choose which ones this
          note applies to.
        </p>
      </div>

      <div className="space-y-2">
        <label
          className={cn(
            "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm",
            mode === "all" && "bg-white ring-1 ring-emerald-200",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="radio"
            name="po-product-scope"
            className="mt-0.5"
            checked={mode === "all"}
            disabled={disabled}
            onChange={() => onModeChange("all")}
          />
          <span>
            <span className="font-medium text-stone-900">
              All products on this PO
            </span>
            <span className="block text-xs text-stone-500">
              One note for the entire PO — it will not repeat per product.
            </span>
          </span>
        </label>

        <label
          className={cn(
            "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm",
            mode === "selected" && "bg-white ring-1 ring-emerald-200",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="radio"
            name="po-product-scope"
            className="mt-0.5"
            checked={mode === "selected"}
            disabled={disabled}
            onChange={() => onModeChange("selected")}
          />
          <span>
            <span className="font-medium text-stone-900">
              Selected products only
            </span>
            <span className="block text-xs text-stone-500">
              Create separate notes when only some products are affected.
            </span>
          </span>
        </label>
      </div>

      {mode === "selected" && (
        <div className="max-h-40 space-y-1 overflow-y-auto border-t border-stone-200 pt-3">
          {products.map((product) => {
            const checked = selectedSkuIds.includes(product.sku_id);
            const isCurrent = product.sku_id === currentSkuId;
            return (
              <label
                key={product.sku_id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white",
                  checked && "bg-white ring-1 ring-emerald-200",
                  disabled && "cursor-not-allowed",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggleSku(product.sku_id)}
                />
                <span className="min-w-0">
                  <SkuProductLabel
                    sku_code={product.sku_code}
                    sku_name={product.sku_name}
                    suffix={isCurrent ? " (current)" : ""}
                    layout="stacked"
                  />
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
