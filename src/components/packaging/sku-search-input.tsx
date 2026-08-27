"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/** Matches Input h-10 / text-sm; grows to at most 2 lines when the label wraps. */
const FIELD_MIN_HEIGHT_PX = 40;
const FIELD_LINE_HEIGHT_PX = 20;
const FIELD_VERTICAL_PADDING_PX = 16;
const FIELD_MAX_LINES = 2;
const FIELD_MAX_HEIGHT_PX =
  FIELD_VERTICAL_PADDING_PX + FIELD_LINE_HEIGHT_PX * FIELD_MAX_LINES;

export interface SkuSearchOption {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle?: boolean;
  is_packaging?: boolean;
  is_extract?: boolean;
  is_active?: boolean;
  franchise_name?: string | null;
}

interface SkuSearchInputProps {
  options: SkuSearchOption[];
  value: SkuSearchOption | null;
  onChange: (option: SkuSearchOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Minimum typed characters before showing matches. Default 1. */
  minQueryLength?: number;
  /** Max dropdown rows. Default 50. */
  maxResults?: number;
}

const DEFAULT_MIN_QUERY_LENGTH = 1;
const DEFAULT_MAX_RESULTS = 50;

function optionLabel(option: SkuSearchOption): string {
  const parts = [option.sku_code];
  if (option.franchise_name) parts.push(option.franchise_name);
  if (option.name) parts.push(option.name);
  return parts.join(" · ");
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/[\s\-_./]+/g, "");
}

function tokenizeQuery(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesSkuSearchOption(
  option: SkuSearchOption,
  query: string,
): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return false;

  const fields = [
    option.sku_code,
    option.name ?? "",
    option.franchise_name ?? "",
  ];
  const haystack = fields.join(" ").toLowerCase();
  const normalizedHaystack = fields.map(normalizeSearchText).join("");

  return tokens.every((token) => {
    const normalizedToken = normalizeSearchText(token);
    return (
      haystack.includes(token) || normalizedHaystack.includes(normalizedToken)
    );
  });
}

export function rankSkuSearchMatch(
  option: SkuSearchOption,
  query: string,
): number {
  const q = query.trim().toLowerCase();
  const code = option.sku_code.toLowerCase();
  const name = option.name?.toLowerCase() ?? "";
  const franchise = option.franchise_name?.toLowerCase() ?? "";
  const normalizedCode = normalizeSearchText(option.sku_code);
  const normalizedQuery = normalizeSearchText(q);

  if (code === q || normalizedCode === normalizedQuery) return 0;
  if (code.startsWith(q) || normalizedCode.startsWith(normalizedQuery)) return 1;
  if (code.includes(q) || normalizedCode.includes(normalizedQuery)) return 2;
  if (name.includes(q) || franchise.includes(q)) return 3;
  if (option.is_active === false) return 5;
  return 4;
}

export function SkuSearchInput({
  options,
  value,
  onChange,
  placeholder = "Search SKU, name, or franchise…",
  disabled = false,
  className,
  minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
  maxResults = DEFAULT_MAX_RESULTS,
}: SkuSearchInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState(value ? optionLabel(value) : "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setQuery(value ? optionLabel(value) : "");
  }, [value]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(
      Math.max(el.scrollHeight, FIELD_MIN_HEIGHT_PX),
      FIELD_MAX_HEIGHT_PX,
    );
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > FIELD_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [query]);

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
    if (q.length < minQueryLength) {
      return { results: [] as SkuSearchOption[], overflowCount: 0 };
    }

    const matches = options
      .filter((option) => matchesSkuSearchOption(option, q))
      .sort(
        (a, b) =>
          rankSkuSearchMatch(a, q) - rankSkuSearchMatch(b, q) ||
          a.sku_code.localeCompare(b.sku_code),
      );

    return {
      results: matches.slice(0, maxResults),
      overflowCount: Math.max(matches.length - maxResults, 0),
    };
  }, [options, query, minQueryLength, maxResults]);

  useEffect(() => {
    setHighlight(0);
  }, [results]);

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

  const trimmedQuery = query.trim();
  const queryTooShort =
    open && trimmedQuery.length > 0 && trimmedQuery.length < minQueryLength;
  const showEmptyHint = open && trimmedQuery.length === 0 && !value;
  const showNoMatches =
    open && trimmedQuery.length >= minQueryLength && results.length === 0;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "min-h-10 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm leading-5 text-stone-900 break-words [overflow-wrap:anywhere] placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50",
          value && "pr-14",
        )}
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
      {value && (
        <button
          type="button"
          className="absolute right-2 top-2.5 text-xs text-stone-400 hover:text-stone-600"
          onClick={clearSelection}
          aria-label="Clear selection"
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
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-medium text-stone-900">
                    {option.sku_code}
                  </span>
                  {option.is_bundle && (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700">
                      Bundle
                    </span>
                  )}
                  {option.is_packaging && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                      Packaging
                    </span>
                  )}
                  {option.is_extract && (
                    <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-800">
                      Extract
                    </span>
                  )}
                  {option.is_active === false && (
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
                      Inactive
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
          Type a SKU code, product name, or franchise to search
        </p>
      )}
      {queryTooShort && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 shadow-lg">
          Type at least {minQueryLength} character
          {minQueryLength === 1 ? "" : "s"} to search
        </p>
      )}
      {showNoMatches && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 shadow-lg">
          No matches for &ldquo;{trimmedQuery}&rdquo;
        </p>
      )}
    </div>
  );
}
