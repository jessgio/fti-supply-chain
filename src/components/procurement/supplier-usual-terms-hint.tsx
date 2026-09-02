"use client";

import { useEffect, useState } from "react";
import {
  formatPctInput,
  formatUsualPctHint,
  formatUsualTermsSummary,
  pctInputMatches,
  type SupplierUsualTerms,
  type UsualTerm,
} from "@/lib/procurement/supplier-usual-terms";

export function useSupplierUsualTerms(
  supplierId: string | null | undefined,
  excludePoId?: string | null,
): {
  terms: SupplierUsualTerms | null;
  loading: boolean;
} {
  const requestKey = `${supplierId ?? ""}|${excludePoId ?? ""}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [terms, setTerms] = useState<SupplierUsualTerms | null>(null);

  useEffect(() => {
    if (!supplierId) {
      setLoadedKey("|");
      setTerms(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (excludePoId) params.set("exclude_po_id", excludePoId);
    const query = params.toString();
    const url = `/api/procurement/suppliers/${supplierId}/terms${
      query ? `?${query}` : ""
    }`;

    void fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load usual terms");
        if (controller.signal.aborted) return;
        setTerms(data.terms ?? null);
        setLoadedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setTerms(null);
        setLoadedKey(requestKey);
      });

    return () => controller.abort();
  }, [supplierId, excludePoId, requestKey]);

  const loading = Boolean(supplierId) && loadedKey !== requestKey;
  const currentTerms = loadedKey === requestKey ? terms : null;
  return { terms: currentTerms, loading };
}

export function SupplierUsualPctHint({
  term,
  poCount,
  currentValue,
  onApply,
}: {
  term: UsualTerm | null | undefined;
  poCount: number;
  currentValue: string;
  onApply: (value: string) => void;
}) {
  if (!term) return null;
  const matches = pctInputMatches(currentValue, term.value);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
      <span>{formatUsualPctHint(term, poCount)}</span>
      {!matches && (
        <button
          type="button"
          className="font-medium text-emerald-700 hover:underline"
          onClick={() => onApply(formatPctInput(term.value))}
        >
          Use
        </button>
      )}
    </div>
  );
}

/** Read-only usual DP / VAT line, e.g. on the PO header. */
export function SupplierUsualTermsSummary({
  terms,
  className = "text-xs text-stone-500",
}: {
  terms: SupplierUsualTerms | null | undefined;
  className?: string;
}) {
  if (!terms) return null;
  return <p className={className}>{formatUsualTermsSummary(terms)}</p>;
}
