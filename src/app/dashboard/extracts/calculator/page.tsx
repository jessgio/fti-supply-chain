"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Beaker, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  SkuSearchInput,
  type SkuSearchOption,
} from "@/components/packaging/sku-search-input";
import { computeAggregatedExtractNeed } from "@/lib/extracts/extract-calculator";
import type { ExtractCalculatorProductResult } from "@/lib/db/extract-calculator";
import { formatNumber } from "@/lib/utils";

export default function ExtractCalculatorPage() {
  const [products, setProducts] = useState<SkuSearchOption[]>([]);
  const [selected, setSelected] = useState<SkuSearchOption[]>([]);
  const [calculators, setCalculators] = useState<
    ExtractCalculatorProductResult[]
  >([]);
  const [qtyBySkuId, setQtyBySkuId] = useState<Record<string, string>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState<SkuSearchOption | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      setLoadingProducts(true);
      try {
        const res = await fetch("/api/packaging/products");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load products");
        if (!active) return;
        setProducts(data.products ?? []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        if (active) setLoadingProducts(false);
      }
    }
    void loadProducts();
    return () => {
      active = false;
    };
  }, []);

  const loadCalculators = useCallback(async (skus: SkuSearchOption[]) => {
    if (skus.length === 0) {
      setCalculators([]);
      return;
    }
    setLoadingCalc(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      for (const sku of skus) {
        params.append("product_sku_id", sku.id);
      }
      const res = await fetch(`/api/extracts/calculator?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load calculator");
      const list: ExtractCalculatorProductResult[] =
        data.products ??
        (data.calculator ? [data.calculator] : []);
      setCalculators(list);
    } catch (err) {
      setCalculators([]);
      setError(err instanceof Error ? err.message : "Failed to load calculator");
    } finally {
      setLoadingCalc(false);
    }
  }, []);

  useEffect(() => {
    void loadCalculators(selected);
  }, [selected, loadCalculators]);

  function handleAddSku(option: SkuSearchOption | null) {
    setPickerValue(null);
    if (!option) return;
    if (selected.some((s) => s.id === option.id)) return;
    setSelected((prev) => [...prev, option]);
  }

  function handleRemoveSku(skuId: string) {
    setSelected((prev) => prev.filter((s) => s.id !== skuId));
    setQtyBySkuId((prev) => {
      const next = { ...prev };
      delete next[skuId];
      return next;
    });
  }

  const availableOptions = useMemo(
    () => products.filter((p) => !selected.some((s) => s.id === p.id)),
    [products, selected],
  );

  const calcBySkuId = useMemo(() => {
    const map = new Map<string, ExtractCalculatorProductResult>();
    for (const calc of calculators) {
      map.set(calc.product_sku_id, calc);
    }
    return map;
  }, [calculators]);

  const aggregatedNeed = useMemo(() => {
    if (calculators.length === 0) return [];

    const balanceByExtract = new Map<string, number>();
    for (const calc of calculators) {
      for (const row of calc.extracts) {
        balanceByExtract.set(row.extract_id, row.ending_balance);
      }
    }

    const plans = calculators.map((calc) => ({
      product_sku_id: calc.product_sku_id,
      product_sku_code: calc.product_sku_code,
      qty: Number(qtyBySkuId[calc.product_sku_id] ?? ""),
      formulas: calc.extracts.map((row) => ({
        extract_id: row.extract_id,
        extract_item_no: row.extract_item_no,
        extract_name: row.extract_name,
        extract_kg_per_unit: row.extract_kg_per_unit,
      })),
      ending_balance_by_extract: balanceByExtract,
    }));

    return computeAggregatedExtractNeed(plans);
  }, [calculators, qtyBySkuId]);

  const allCovered =
    aggregatedNeed.length > 0 && aggregatedNeed.every((row) => row.covers);
  const hasAnyQty = selected.some((sku) => {
    const qty = Number(qtyBySkuId[sku.id] ?? "");
    return Number.isFinite(qty) && qty > 0;
  });

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/extracts"
            className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to extracts
          </Link>
          <div className="flex items-center gap-2">
            <Beaker className="h-6 w-6 text-emerald-800" />
            <h1 className="text-2xl font-semibold text-stone-900">
              Extract calculator
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-stone-600">
            Add one or more finished-good SKUs to see makeable pcs from current
            extract stock, and combined extract need when formulas share the
            same pool.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Finished-good SKUs</CardTitle>
          <CardDescription>
            Add multiple SKUs when extracts are shared across products. Only
            SKUs with extract formulas produce a calculation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xl">
            <SkuSearchInput
              options={availableOptions}
              value={pickerValue}
              onChange={handleAddSku}
              placeholder="Add SKU by code, name, or franchise…"
              disabled={loadingProducts}
            />
          </div>

          {selected.length === 0 ? (
            <p className="text-sm text-stone-500">
              No SKUs selected yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {selected.map((sku) => (
                <li
                  key={sku.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-sm text-stone-800"
                >
                  <span className="font-medium">{sku.sku_code}</span>
                  {sku.name && (
                    <span className="max-w-[12rem] truncate text-stone-500">
                      {sku.name}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveSku(sku.id)}
                    className="rounded-full p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                    aria-label={`Remove ${sku.sku_code}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selected.length > 0 && loadingCalc && (
        <p className="text-sm text-stone-500">Loading formulas and balances…</p>
      )}

      {selected.length > 0 && !loadingCalc && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Makeable from stock</CardTitle>
              <CardDescription>
                Per-SKU max pcs from current extract balances. Shared extracts
                mean you cannot hit every SKU’s max at the same time — use
                proposed qtys below for a combined check.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected.map((sku) => {
                const calc = calcBySkuId.get(sku.id);
                if (!calc) {
                  return (
                    <p key={sku.id} className="text-sm text-stone-500">
                      {sku.sku_code}: SKU data unavailable.
                    </p>
                  );
                }
                if (calc.extracts.length === 0) {
                  return (
                    <div
                      key={sku.id}
                      className="rounded-lg border border-stone-200 px-4 py-3 text-sm"
                    >
                      <span className="font-medium">{calc.product_sku_code}</span>
                      <span className="text-stone-500">
                        {" "}
                        — no extract formulas.{" "}
                      </span>
                      <Link
                        href={`/dashboard/extracts/formulas?product=${calc.product_sku_id}`}
                        className="text-emerald-700 underline underline-offset-2"
                      >
                        Add formulas
                      </Link>
                    </div>
                  );
                }
                return (
                  <div
                    key={sku.id}
                    className="overflow-x-auto rounded-lg border border-stone-200"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 bg-stone-50 px-3 py-2">
                      <div>
                        <span className="font-medium text-stone-900">
                          {calc.product_sku_code}
                        </span>
                        {calc.product_name && (
                          <span className="ml-2 text-sm text-stone-500">
                            {calc.product_name}
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-semibold tabular-nums text-stone-900">
                        {formatNumber(calc.max_pcs)}{" "}
                        <span className="text-sm font-medium text-stone-500">
                          pcs max
                        </span>
                      </p>
                    </div>
                    <table className="w-full text-left text-sm">
                      <thead className="text-stone-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Extract</th>
                          <th className="px-3 py-2 text-right font-medium">
                            Balance
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            kg / pc
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Max pcs
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {calc.extracts.map((row) => {
                          const limiting =
                            row.extract_id === calc.limiting_extract_id;
                          return (
                            <tr
                              key={row.extract_id}
                              className={`border-t border-stone-100 ${
                                limiting ? "bg-amber-50/80" : ""
                              }`}
                            >
                              <td className="px-3 py-2">
                                <Link
                                  href={`/dashboard/extracts/${row.extract_id}`}
                                  className="font-medium hover:underline"
                                >
                                  {row.extract_item_no}
                                </Link>
                                {row.extract_name && (
                                  <span className="block text-xs text-stone-500">
                                    {row.extract_name}
                                  </span>
                                )}
                                {limiting && (
                                  <span className="mt-0.5 block text-xs text-amber-800">
                                    Limiting
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatNumber(row.ending_balance, 5)} kg
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatNumber(row.extract_kg_per_unit, 8)}
                              </td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums">
                                {formatNumber(row.max_pcs)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Combined extract for proposed qtys
              </CardTitle>
              <CardDescription>
                Enter planned fill qty per SKU. Extract need is summed across
                SKUs and checked against each extract’s shared balance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selected.map((sku) => {
                  const calc = calcBySkuId.get(sku.id);
                  const hasFormulas = (calc?.extracts.length ?? 0) > 0;
                  return (
                    <div key={sku.id}>
                      <label className="mb-1 block text-xs font-medium text-stone-500">
                        {sku.sku_code} (pcs)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        placeholder="e.g. 10000"
                        value={qtyBySkuId[sku.id] ?? ""}
                        disabled={!hasFormulas}
                        onChange={(e) =>
                          setQtyBySkuId((prev) => ({
                            ...prev,
                            [sku.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>

              {!hasAnyQty ? (
                <p className="text-sm text-stone-500">
                  Enter a positive quantity on at least one SKU to see combined
                  extract need.
                </p>
              ) : aggregatedNeed.length === 0 ? (
                <p className="text-sm text-stone-500">
                  Selected SKUs have no extract formulas to calculate.
                </p>
              ) : (
                <>
                  <p
                    className={`text-sm font-medium ${
                      allCovered ? "text-emerald-800" : "text-rose-800"
                    }`}
                  >
                    {allCovered
                      ? "Current extract balances cover the combined qtys."
                      : "One or more extracts need a top-up for the combined qtys."}
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-stone-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-stone-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Extract</th>
                          <th className="px-3 py-2 font-medium">Used by</th>
                          <th className="px-3 py-2 text-right font-medium">
                            Needed
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Balance
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Shortfall
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregatedNeed.map((row) => (
                          <tr
                            key={row.extract_id}
                            className={`border-t border-stone-100 ${
                              row.covers ? "" : "bg-rose-50/70"
                            }`}
                          >
                            <td className="px-3 py-2">
                              <Link
                                href={`/dashboard/extracts/${row.extract_id}`}
                                className="font-medium hover:underline"
                              >
                                {row.extract_item_no}
                              </Link>
                              {row.extract_name && (
                                <span className="block text-xs text-stone-500">
                                  {row.extract_name}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-stone-600">
                              {row.sku_codes.join(", ")}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNumber(row.needed_kg, 5)} kg
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNumber(row.ending_balance, 5)} kg
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-medium tabular-nums ${
                                row.covers ? "text-stone-500" : "text-rose-700"
                              }`}
                            >
                              {row.covers
                                ? "—"
                                : `${formatNumber(row.shortfall_kg, 5)} kg`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
