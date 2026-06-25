"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface RelationOption {
  id: string;
  label: string;
}

interface PhaseRelationsCellProps {
  dependsOnIds: string[];
  parallelWithIds: string[];
  options: RelationOption[];
  selfId: string;
  onChange: (next: {
    dependsOnIds: string[];
    parallelWithIds: string[];
  }) => void;
}

function normalizeLabel(label: string): string {
  return label.replace(/^↳\s*/, "").trim().toLowerCase();
}

function toggle(list: string[], id: string, checked: boolean): string[] {
  if (checked) return [...new Set([...list, id])];
  return list.filter((item) => item !== id);
}

function RelationSection({
  title,
  query,
  options,
  selectedIds,
  onToggle,
}: {
  title: string;
  query: string;
  options: RelationOption[];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => normalizeLabel(opt.label).includes(q));
  }, [options, query]);

  const selectedSet = new Set(selectedIds);

  return (
    <div>
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </p>
      <div className="max-h-32 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-1 text-xs text-stone-400">No matching tasks</p>
        ) : (
          filtered.map((opt) => (
            <label
              key={opt.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-stone-50",
                selectedSet.has(opt.id) && "bg-emerald-50/80",
              )}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(opt.id)}
                onChange={(e) => onToggle(opt.id, e.target.checked)}
                className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function PhaseRelationsCell({
  dependsOnIds,
  parallelWithIds,
  options,
  selfId,
  onChange,
}: PhaseRelationsCellProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const available = useMemo(
    () => options.filter((o) => o.id !== selfId),
    [options, selfId],
  );

  const optionById = useMemo(
    () => new Map(available.map((o) => [o.id, o])),
    [available],
  );

  const summary = useMemo(() => {
    const depNames = dependsOnIds
      .map((id) => optionById.get(id)?.label)
      .filter(Boolean) as string[];
    const parNames = parallelWithIds
      .map((id) => optionById.get(id)?.label)
      .filter(Boolean) as string[];

    const parts: string[] = [];
    if (depNames.length > 0) {
      const shown = depNames.slice(0, 2).map(normalizeLabel).join(", ");
      const extra = depNames.length > 2 ? ` +${depNames.length - 2}` : "";
      parts.push(`Dep: ${shown}${extra}`);
    }
    if (parNames.length > 0) {
      const shown = parNames.slice(0, 2).map(normalizeLabel).join(", ");
      const extra = parNames.length > 2 ? ` +${parNames.length - 2}` : "";
      parts.push(`Par: ${shown}${extra}`);
    }
    return parts.join(" · ");
  }, [dependsOnIds, parallelWithIds, optionById]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-[7rem]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1 rounded-md border border-transparent px-2 text-left text-xs hover:border-stone-300 hover:bg-white",
          summary ? "text-emerald-800" : "text-stone-400",
        )}
        title={summary || "Set dependencies and parallel tasks"}
      >
        <span className="truncate">{summary || "Set links"}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 w-72 rounded-md border border-stone-200 bg-white p-2 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type task name…"
              className="h-8 w-full rounded-md border border-stone-200 bg-stone-50 pl-8 pr-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          {available.length === 0 ? (
            <p className="px-1 py-2 text-xs text-stone-400">No other tasks yet</p>
          ) : (
            <div className="space-y-2">
              <RelationSection
                title="Depends on"
                query={query}
                options={available}
                selectedIds={dependsOnIds}
                onToggle={(id, checked) =>
                  onChange({
                    dependsOnIds: toggle(dependsOnIds, id, checked),
                    parallelWithIds,
                  })
                }
              />
              <RelationSection
                title="Parallel with"
                query={query}
                options={available}
                selectedIds={parallelWithIds}
                onToggle={(id, checked) =>
                  onChange({
                    dependsOnIds,
                    parallelWithIds: toggle(parallelWithIds, id, checked),
                  })
                }
              />
            </div>
          )}

          <p className="mt-2 border-t border-stone-100 pt-2 text-[10px] text-stone-400">
            Search filters both lists. Check all tasks that apply.
          </p>
        </div>
      )}
    </div>
  );
}
