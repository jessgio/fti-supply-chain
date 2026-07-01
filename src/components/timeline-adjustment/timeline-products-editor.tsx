"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import {
  TimelineProductInput,
  type TimelineProductValue,
} from "@/components/timeline-adjustment/timeline-product-input";
import { Button } from "@/components/ui/button";
import {
  displayTimelineProductName,
  formatTimelineDisplayName,
  isDuplicateTimelineProduct,
  resolveTimelineProduct,
} from "@/lib/timeline-adjustment/products";
import type { TimelineScheduleProduct } from "@/lib/timeline-adjustment/schedule";
import { formatDate } from "@/lib/utils";
import type { TimelineProductOption } from "@/types/database";

export interface FormTimelineProduct {
  productName: string;
  skuId: string | null;
}

interface TimelineProductsEditorProps {
  products: FormTimelineProduct[];
  catalogProducts: TimelineProductOption[];
  catalogLoading: boolean;
  onChange: (products: FormTimelineProduct[]) => void;
  anchor: "start" | "warehouse_delivery";
  anchorDate: string;
  onUseStockoutDate: (date: string) => void;
}

function toScheduleProduct(product: FormTimelineProduct): TimelineScheduleProduct {
  return {
    productName: product.productName,
    skuId: product.skuId,
  };
}

export function TimelineProductsEditor({
  products,
  catalogProducts,
  catalogLoading,
  onChange,
  anchor,
  anchorDate,
  onUseStockoutDate,
}: TimelineProductsEditorProps) {
  const [draft, setDraft] = useState<TimelineProductValue>({
    productName: "",
    skuId: null,
  });
  const [addError, setAddError] = useState<string | null>(null);

  const catalogByEntry = useMemo(
    () =>
      products.map((product) =>
        resolveTimelineProduct(catalogProducts, {
          skuId: product.skuId,
          productName: product.productName,
        }),
      ),
    [products, catalogProducts],
  );

  const earliestStockout = useMemo(() => {
    const dates = catalogByEntry
      .map((entry) => entry?.projected_stockout_date)
      .filter((date): date is string => Boolean(date))
      .sort();
    return dates[0] ?? null;
  }, [catalogByEntry]);

  function handleAddProduct() {
    setAddError(null);
    const trimmed = draft.productName.trim();
    if (!trimmed) {
      setAddError("Enter or select a product to add.");
      return;
    }

    const candidate: FormTimelineProduct = {
      productName: trimmed,
      skuId: draft.skuId,
    };

    const scheduleProducts = products.map(toScheduleProduct);
    if (isDuplicateTimelineProduct(scheduleProducts, toScheduleProduct(candidate))) {
      setAddError("That product is already in this timeline.");
      return;
    }

    onChange([...products, candidate]);
    setDraft({ productName: "", skuId: null });
  }

  function handleRemove(index: number) {
    onChange(products.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {products.length > 0 ? (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
          {products.map((product, index) => {
            const catalog = catalogByEntry[index];
            return (
              <li
                key={`${product.skuId ?? "custom"}-${product.productName}-${index}`}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-stone-900">
                    {catalog?.sku_code ?? product.productName}
                  </p>
                  <p className="text-sm text-stone-500">
                    {catalog
                      ? [catalog.franchise_name, displayTimelineProductName(catalog)]
                          .filter(Boolean)
                          .join(" · ")
                      : "New product (custom name)"}
                  </p>
                  {catalog && (
                    <p className="mt-1 text-xs text-amber-800">
                      {catalog.projected_stockout_date ? (
                        <>
                          Restock · projected OOS{" "}
                          <span className="font-medium tabular-nums">
                            {formatDate(catalog.projected_stockout_date)}
                          </span>
                          {catalog.days_until_stockout != null && (
                            <span>
                              {" "}
                              ({catalog.days_until_stockout} day
                              {catalog.days_until_stockout === 1 ? "" : "s"})
                            </span>
                          )}
                        </>
                      ) : (
                        "Restock · no projected out-of-stock date"
                      )}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  aria-label={`Remove ${product.productName}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
          No products yet. Add one or more products that share this production
          timeline.
        </p>
      )}

      <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50/60 p-4">
        <p className="text-sm font-medium text-stone-700">Add product</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <TimelineProductInput
            products={catalogProducts}
            value={draft}
            onChange={setDraft}
            disabled={catalogLoading}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddProduct}
            disabled={catalogLoading}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        {addError && <p className="text-xs text-rose-600">{addError}</p>}
        <p className="text-xs text-stone-500">
          Search the catalog or type a new name, then click Add. All products in
          this timeline share the same schedule.
        </p>
      </div>

      {products.length > 0 && catalogByEntry.some(Boolean) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-amber-900">
                {formatTimelineDisplayName(products.map(toScheduleProduct))}
              </p>
              <p className="mt-1 text-amber-800">
                {catalogByEntry.filter(Boolean).length} catalog product
                {catalogByEntry.filter(Boolean).length === 1 ? "" : "s"} in this
                restock timeline.
              </p>
              {earliestStockout && (
                <p className="mt-1 text-amber-800">
                  Earliest projected out of stock:{" "}
                  <span className="font-semibold tabular-nums">
                    {formatDate(earliestStockout)}
                  </span>
                </p>
              )}
              {earliestStockout && anchor === "warehouse_delivery" && !anchorDate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                  onClick={() => onUseStockoutDate(earliestStockout)}
                >
                  Use earliest stockout as warehouse delivery
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
