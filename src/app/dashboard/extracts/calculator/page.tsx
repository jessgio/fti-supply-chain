"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Beaker } from "lucide-react";
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
import { computeExtractNeedForQty } from "@/lib/extracts/extract-calculator";
import type { ExtractCalculatorResult } from "@/lib/db/extract-calculator";
import { formatNumber } from "@/lib/utils";

export default function ExtractCalculatorPage() {
  const [products, setProducts] = useState<SkuSearchOption[]>([]);
  const [selected, setSelected] = useState<SkuSearchOption | null>(null);
  const [calculator, setCalculator] = useState<ExtractCalculatorResult | null>(
    null,
  );
  const [proposedQty, setProposedQty] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadCalculator = useCallback(async (skuId: string) => {
    setLoadingCalc(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/extracts/calculator?product_sku_id=${encodeURIComponent(skuId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load calculator");
      setCalculator(data.calculator ?? null);
    } catch (err) {
      setCalculator(null);
      setError(err instanceof Error ? err.message : "Failed to load calculator");
    } finally {
      setLoadingCalc(false);
    }
  }, []);

  function handleSelect(option: SkuSearchOption | null) {
    setSelected(option);
    setProposedQty("");
    setCalculator(null);
    if (option) void loadCalculator(option.id);
  }

  const qty = Number(proposedQty);
  const needRows = useMemo(() => {
    if (!calculator || calculator.extracts.length === 0) return [];
    if (!Number.isFinite(qty) || qty <= 0) return [];
    return computeExtractNeedForQty(calculator.extracts, qty);
  }, [calculator, qty]);

  const allCovered =
    needRows.length > 0 && needRows.every((row) => row.covers);

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
            See how many finished units you can make from current extract stock,
            or how much extract a proposed fill qty needs — using extract
            formulas and the latest ledger balances.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Finished-good SKU</CardTitle>
          <CardDescription>
            Only SKUs with extract formulas produce a calculation.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-xl">
          <SkuSearchInput
            options={products}
            value={selected}
            onChange={handleSelect}
            placeholder="Type SKU code, name, or franchise…"
            disabled={loadingProducts}
          />
        </CardContent>
      </Card>

      {selected && loadingCalc && (
        <p className="text-sm text-stone-500">Loading formulas and balances…</p>
      )}

      {selected && !loadingCalc && calculator && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Makeable from stock</CardTitle>
              <CardDescription>
                Limited by the scarcest extract in the formula for{" "}
                <span className="font-medium text-stone-800">
                  {calculator.product_sku_code}
                </span>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {calculator.extracts.length === 0 ? (
                <p className="text-sm text-stone-500">
                  No extract formulas for this SKU.{" "}
                  <Link
                    href={`/dashboard/extracts/formulas?product=${calculator.product_sku_id}`}
                    className="text-emerald-700 underline underline-offset-2"
                  >
                    Add formulas
                  </Link>
                </p>
              ) : (
                <>
                  <p className="text-3xl font-semibold tabular-nums text-stone-900">
                    {formatNumber(calculator.max_pcs)}{" "}
                    <span className="text-base font-medium text-stone-500">
                      pcs
                    </span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-stone-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-stone-500">
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
                        {calculator.extracts.map((row) => {
                          const limiting =
                            row.extract_id === calculator.limiting_extract_id;
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
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extract for proposed qty</CardTitle>
              <CardDescription>
                Enter how many finished pcs you plan to fill.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {calculator.extracts.length === 0 ? (
                <p className="text-sm text-stone-500">
                  Add formulas first to calculate extract need.
                </p>
              ) : (
                <>
                  <div className="max-w-xs">
                    <label className="mb-1 block text-xs font-medium text-stone-500">
                      Proposed qty (pcs)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="e.g. 10000"
                      value={proposedQty}
                      onChange={(e) => setProposedQty(e.target.value)}
                    />
                  </div>

                  {needRows.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      Enter a positive quantity to see extract need.
                    </p>
                  ) : (
                    <>
                      <p
                        className={`text-sm font-medium ${
                          allCovered ? "text-emerald-800" : "text-rose-800"
                        }`}
                      >
                        {allCovered
                          ? "Current extract balances cover this qty."
                          : "One or more extracts need a top-up for this qty."}
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-stone-200">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-stone-50 text-stone-500">
                            <tr>
                              <th className="px-3 py-2 font-medium">Extract</th>
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
                            {needRows.map((row) => (
                              <tr
                                key={row.extract_id}
                                className={`border-t border-stone-100 ${
                                  row.covers ? "" : "bg-rose-50/70"
                                }`}
                              >
                                <td className="px-3 py-2">
                                  <span className="font-medium">
                                    {row.extract_item_no}
                                  </span>
                                  {row.extract_name && (
                                    <span className="block text-xs text-stone-500">
                                      {row.extract_name}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatNumber(row.needed_kg, 5)} kg
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatNumber(row.ending_balance, 5)} kg
                                </td>
                                <td
                                  className={`px-3 py-2 text-right font-medium tabular-nums ${
                                    row.covers
                                      ? "text-stone-500"
                                      : "text-rose-700"
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
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
