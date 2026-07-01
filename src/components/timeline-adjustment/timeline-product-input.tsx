"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  matchesSkuSearchOption,
  rankSkuSearchMatch,
  type SkuSearchOption,
} from "@/components/packaging/sku-search-input";
import { displayTimelineProductName } from "@/lib/timeline-adjustment/products";
import { cn } from "@/lib/utils";
import type { TimelineProductOption } from "@/types/database";

export interface TimelineProductValue {
  productName: string;
  skuId: string | null;
}

interface TimelineProductInputProps {
  products: TimelineProductOption[];
  value: TimelineProductValue;
  onChange: (value: TimelineProductValue) => void;
  disabled?: boolean;
  className?: string;
}

function toSearchOption(product: TimelineProductOption): SkuSearchOption {
  return {
    id: product.id,
    sku_code: product.sku_code,
    name: product.name,
    franchise_name: product.franchise_name,
    is_active: product.is_active,
  };
}

function optionLabel(product: TimelineProductOption): string {
  const parts = [product.sku_code];
  if (product.franchise_name) parts.push(product.franchise_name);
  const name = displayTimelineProductName(product);
  if (product.name) parts.push(name);
  return parts.join(" · ");
}

function findProductById(
  products: TimelineProductOption[],
  skuId: string | null,
): TimelineProductOption | null {
  if (!skuId) return null;
  return products.find((p) => p.id === skuId) ?? null;
}

export function TimelineProductInput({
  products,
  value,
  onChange,
  disabled = false,
  className,
}: TimelineProductInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const selectedProduct = findProductById(products, value.skuId);
  const [query, setQuery] = useState(
    selectedProduct ? optionLabel(selectedProduct) : value.productName,
  );
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const product = findProductById(products, value.skuId);
    setQuery(product ? optionLabel(product) : value.productName);
  }, [value.productName, value.skuId, products]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const { results, overflowCount } = useMemo(() => {
    const q = query.trim();

    const pool =
      q.length < 1
        ? products
        : products.filter((product) =>
            matchesSkuSearchOption(toSearchOption(product), q),
          );

    const matches = [...pool].sort(
      (a, b) =>
        (q.length > 0
          ? rankSkuSearchMatch(toSearchOption(a), q) -
            rankSkuSearchMatch(toSearchOption(b), q)
          : 0) || a.sku_code.localeCompare(b.sku_code),
    );

    return {
      results: matches.slice(0, 50),
      overflowCount: Math.max(matches.length - 50, 0),
    };
  }, [products, query]);

  useEffect(() => {
    setHighlight(0);
  }, [results]);

  function selectProduct(product: TimelineProductOption) {
    onChange({
      productName: displayTimelineProductName(product),
      skuId: product.id,
    });
    setQuery(optionLabel(product));
    setOpen(false);
  }

  function commitCustomName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      onChange({ productName: "", skuId: null });
      return;
    }

    const exactMatch = products.find((product) => {
      const option = toSearchOption(product);
      return (
        product.sku_code.toLowerCase() === trimmed.toLowerCase() ||
        (product.name?.trim().toLowerCase() ?? "") === trimmed.toLowerCase() ||
        displayTimelineProductName(product).toLowerCase() === trimmed.toLowerCase()
      );
    });

    if (exactMatch) {
      selectProduct(exactMatch);
      return;
    }

    onChange({ productName: trimmed, skuId: null });
    setQuery(trimmed);
    setOpen(false);
  }

  function clearSelection() {
    onChange({ productName: "", skuId: null });
    setQuery("");
    setOpen(true);
  }

  const trimmedQuery = query.trim();
  const showEmptyHint =
    open && trimmedQuery.length === 0 && !value.skuId && results.length === 0;
  const showNoMatches =
    open && trimmedQuery.length >= 1 && results.length === 0;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        id="product-name"
        value={query}
        disabled={disabled}
        placeholder="Search existing products or type a new product name…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          const selected = findProductById(products, value.skuId);
          if (value.skuId && selected && e.target.value !== optionLabel(selected)) {
            onChange({ productName: e.target.value, skuId: null });
          } else if (!value.skuId) {
            onChange({ productName: e.target.value, skuId: null });
          }
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (!rootRef.current?.contains(document.activeElement)) {
              const current = valueRef.current;
              if (trimmedQuery && !current.skuId) {
                commitCustomName(trimmedQuery);
              }
            }
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && results[highlight]) {
              selectProduct(results[highlight]);
            } else if (trimmedQuery) {
              commitCustomName(trimmedQuery);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {(value.productName || value.skuId) && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
          onClick={clearSelection}
          aria-label="Clear product"
        >
          Clear
        </button>
      )}
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {results.map((product, idx) => (
            <li key={product.id} role="option" aria-selected={idx === highlight}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-stone-50",
                  idx === highlight && "bg-stone-50",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => selectProduct(product)}
              >
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-medium text-stone-900">
                    {product.sku_code}
                  </span>
                  {product.is_active === false && (
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
                      Inactive
                    </span>
                  )}
                </span>
                <span className="text-xs text-stone-500">
                  {[product.franchise_name, displayTimelineProductName(product)]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </button>
            </li>
          ))}
          {overflowCount > 0 && (
            <li className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">
              {overflowCount} more match{overflowCount === 1 ? "" : "es"} — type
              more to narrow down
            </li>
          )}
        </ul>
      )}
      {showEmptyHint && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 shadow-lg">
          Pick a product below or type a new product name and press Enter
        </p>
      )}
      {showNoMatches && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 shadow-lg">
          No catalog match for &ldquo;{trimmedQuery}&rdquo;. Press Enter to use
          as a new product.
        </p>
      )}
    </div>
  );
}
