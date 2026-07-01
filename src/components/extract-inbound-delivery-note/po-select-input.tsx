"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractInboundPoOption } from "@/types/database";

interface PoSelectInputProps {
  options: ExtractInboundPoOption[];
  value: string;
  onChange: (poId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function poTitle(po: ExtractInboundPoOption): string {
  return `${po.po_number} (${po.status})`;
}

function skuSummary(po: ExtractInboundPoOption): string {
  return po.sku_names.join(", ");
}

function matchesPo(po: ExtractInboundPoOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (po.po_number.toLowerCase().includes(q)) return true;
  if (po.status.toLowerCase().includes(q)) return true;
  return po.sku_names.some((name) => name.toLowerCase().includes(q));
}

export function PoSelectInput({
  options,
  value,
  onChange,
  placeholder = "Select PO…",
  disabled = false,
  className,
}: PoSelectInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((po) => po.id === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const results = useMemo(
    () => options.filter((po) => matchesPo(po, query)),
    [options, query],
  );

  useEffect(() => {
    setHighlight(0);
  }, [results]);

  function selectPo(po: ExtractInboundPoOption) {
    onChange(po.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-emerald-600 ring-1 ring-emerald-600",
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          if (!open) setQuery("");
        }}
      >
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{poTitle(selected)}</span>
            {selected.sku_names.length > 0 && (
              <span className="block truncate text-xs italic text-stone-500">
                {skuSummary(selected)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-stone-500">{placeholder}</span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-stone-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-100 p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by PO or SKU…"
              className="w-full rounded-md border border-stone-200 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter" && results[highlight]) {
                  e.preventDefault();
                  selectPo(results[highlight]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                  setQuery("");
                }
              }}
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-72 overflow-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-stone-500">No matching purchase orders.</li>
            ) : (
              results.map((po, idx) => (
                <li key={po.id} role="option" aria-selected={po.id === value}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col px-3 py-2 text-left hover:bg-stone-50",
                      idx === highlight && "bg-stone-50",
                      po.id === value && "bg-emerald-50",
                    )}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => selectPo(po)}
                  >
                    <span className="text-sm font-medium text-stone-900">{poTitle(po)}</span>
                    {po.sku_names.length > 0 ? (
                      <span className="text-xs italic text-stone-500">{skuSummary(po)}</span>
                    ) : (
                      <span className="text-xs italic text-stone-400">No line items</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
