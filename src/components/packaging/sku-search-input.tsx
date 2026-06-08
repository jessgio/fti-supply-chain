"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SkuSearchOption {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle?: boolean;
  franchise_name?: string | null;
}

interface SkuSearchInputProps {
  options: SkuSearchOption[];
  value: SkuSearchOption | null;
  onChange: (option: SkuSearchOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function optionLabel(option: SkuSearchOption): string {
  const parts = [option.sku_code];
  if (option.franchise_name) parts.push(option.franchise_name);
  if (option.name) parts.push(option.name);
  return parts.join(" · ");
}

function rankMatch(option: SkuSearchOption, query: string): number {
  const code = option.sku_code.toLowerCase();
  const name = option.name?.toLowerCase() ?? "";
  const franchise = option.franchise_name?.toLowerCase() ?? "";
  if (code.startsWith(query)) return 0;
  if (code.includes(query)) return 1;
  if (name.includes(query) || franchise.includes(query)) return 2;
  return 99;
}

export function SkuSearchInput({
  options,
  value,
  onChange,
  placeholder = "Search SKU, name, or franchise…",
  disabled = false,
  className,
}: SkuSearchInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value ? optionLabel(value) : "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setQuery(value ? optionLabel(value) : "");
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 12);
    return options
      .filter((option) => {
        const haystack = [
          option.sku_code,
          option.name ?? "",
          option.franchise_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort(
        (a, b) => rankMatch(a, q) - rankMatch(b, q) || a.sku_code.localeCompare(b.sku_code),
      )
      .slice(0, 12);
  }, [options, query]);

  function selectOption(option: SkuSearchOption) {
    onChange(option);
    setQuery(optionLabel(option));
    setOpen(false);
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
    setOpen(true);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (value && e.target.value !== optionLabel(value)) {
            onChange(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open && filtered[highlight]) {
            e.preventDefault();
            selectOption(filtered[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {value && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
          onClick={clearSelection}
          aria-label="Clear selection"
        >
          Clear
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((option, idx) => (
            <li key={option.id} role="option" aria-selected={idx === highlight}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-stone-50",
                  idx === highlight && "bg-stone-50",
                )}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => selectOption(option)}
              >
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-medium text-stone-900">
                    {option.sku_code}
                  </span>
                  {option.is_bundle && (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700">
                      Bundle
                    </span>
                  )}
                </span>
                <span className="text-xs text-stone-500">
                  {[option.franchise_name, option.name].filter(Boolean).join(" · ") ||
                    "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 shadow-lg">
          No matches for &ldquo;{query.trim()}&rdquo;
        </p>
      )}
    </div>
  );
}
