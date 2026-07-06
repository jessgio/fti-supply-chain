"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

export interface LinkedPoOption {
  id: string;
  po_number: string;
  status?: string | null;
  supplier_name?: string | null;
}

interface LinkedPoPickerProps {
  primaryPoId: string;
  selected: LinkedPoOption[];
  onChange: (pos: LinkedPoOption[]) => void;
  disabled?: boolean;
}

export function LinkedPoPicker({
  primaryPoId,
  selected,
  onChange,
  disabled = false,
}: LinkedPoPickerProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [results, setResults] = useState<LinkedPoOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = debouncedSearch.trim();
    if (query.length < 2 || !primaryPoId) {
      setResults([]);
      return;
    }

    let active = true;
    async function run() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, exclude: primaryPoId });
        const res = await fetch(`/api/status-updates/po-search?${params}`);
        const data = await res.json();
        if (!active || !res.ok) return;
        const selectedIds = new Set(selected.map((po) => po.id));
        setResults(
          (data.pos ?? []).filter(
            (po: LinkedPoOption) => !selectedIds.has(po.id),
          ),
        );
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void run();
    return () => {
      active = false;
    };
  }, [debouncedSearch, primaryPoId, selected]);

  function addPo(po: LinkedPoOption) {
    if (selected.some((entry) => entry.id === po.id)) return;
    onChange([...selected, po]);
    setSearch("");
    setResults([]);
  }

  function removePo(poId: string) {
    onChange(selected.filter((po) => po.id !== poId));
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((po) => (
            <li
              key={po.id}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-stone-800"
            >
              <span className="font-medium">{po.po_number}</span>
              {po.supplier_name ? (
                <span className="text-stone-500">· {po.supplier_name}</span>
              ) : null}
              <button
                type="button"
                className="rounded p-0.5 text-stone-500 hover:bg-sky-100 hover:text-stone-800 disabled:opacity-50"
                onClick={() => removePo(po.id)}
                disabled={disabled}
                aria-label={`Remove ${po.po_number}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Input
        placeholder="Search PO number to link another PO…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={disabled || !primaryPoId}
      />

      {!primaryPoId ? (
        <p className="text-xs text-stone-500">
          Select the primary PO first, then link other POs here.
        </p>
      ) : loading ? (
        <p className="text-xs text-stone-500">Searching…</p>
      ) : results.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1">
          {results.map((po) => (
            <li key={po.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-stone-50",
                  disabled && "cursor-not-allowed opacity-60",
                )}
                onClick={() => addPo(po)}
                disabled={disabled}
              >
                <span className="font-medium text-stone-900">{po.po_number}</span>
                {po.supplier_name ? (
                  <span className="block text-xs text-stone-500">
                    {po.supplier_name}
                    {po.status
                      ? ` · ${po.status.replace(/_/g, " ")}`
                      : ""}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : debouncedSearch.trim().length >= 2 ? (
        <p className="text-xs text-stone-500">No matching POs found.</p>
      ) : (
        <p className="text-xs text-stone-500">
          Type at least 2 characters to search for another PO.
        </p>
      )}
    </div>
  );
}
