"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ExtractCode } from "@/types/database";

export type ExtractSearchOption = Pick<ExtractCode, "id" | "item_code" | "extract_name">;

interface ExtractSearchInputProps {
  options: ExtractSearchOption[];
  value: ExtractSearchOption | null;
  onChange: (option: ExtractSearchOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function optionLabel(option: ExtractSearchOption): string {
  return option.extract_name;
}

function matchesOption(option: ExtractSearchOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    option.item_code.toLowerCase().includes(q) ||
    option.extract_name.toLowerCase().includes(q)
  );
}

export function ExtractSearchInput({
  options,
  value,
  onChange,
  placeholder = "Type extract name to search…",
  disabled = false,
  className,
}: ExtractSearchInputProps) {
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

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    return options
      .filter((option) => matchesOption(option, q))
      .slice(0, 50);
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [results]);

  function selectOption(option: ExtractSearchOption) {
    onChange(option);
    setQuery(optionLabel(option));
    setOpen(false);
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
          if (value && e.target.value !== optionLabel(value)) {
            onChange(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open && results[highlight]) {
            e.preventDefault();
            selectOption(results[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {results.map((option, idx) => (
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
                <span className="font-medium text-stone-900">{option.extract_name}</span>
                <span className="font-mono text-xs text-stone-500">{option.item_code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length >= 1 && results.length === 0 && (
        <p className="absolute z-50 mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 shadow-lg">
          No matches for &ldquo;{query.trim()}&rdquo;
        </p>
      )}
    </div>
  );
}
