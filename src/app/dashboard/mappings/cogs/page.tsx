"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Search } from "lucide-react";
import { grossMarginPct } from "@/lib/db/sku-cogs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SkuCogsRow } from "@/types/database";
import { formatCurrency, formatPct } from "@/lib/utils";

function formatCogsInput(value: number | null): string {
  if (value == null) return "";
  return String(value);
}

function marginClass(pct: number | null): string {
  if (pct === null) return "text-stone-400";
  if (pct >= 50) return "text-emerald-700";
  if (pct >= 25) return "text-stone-700";
  return "text-amber-700";
}

export default function SkuCogsPage() {
  const [skus, setSkus] = useState<SkuCogsRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/skus/cogs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const rows = (data.skus ?? []) as SkuCogsRow[];
      setSkus(rows);
      setDraft(
        Object.fromEntries(
          rows.map((r) => [r.sku_id, formatCogsInput(r.unit_cogs)]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return skus;
    return skus.filter(
      (s) =>
        s.sku_code.toLowerCase().includes(q) ||
        (s.product_name?.toLowerCase().includes(q) ?? false) ||
        (s.franchise_name?.toLowerCase().includes(q) ?? false) ||
        (draft[s.sku_id]?.includes(q) ?? false),
    );
  }, [skus, search, draft]);

  const changedCount = useMemo(
    () =>
      skus.filter((s) => {
        const current = (draft[s.sku_id] ?? "").trim();
        const original = formatCogsInput(s.unit_cogs).trim();
        return current !== original;
      }).length,
    [skus, draft],
  );

  const pricedCount = useMemo(
    () => skus.filter((s) => (draft[s.sku_id] ?? "").trim()).length,
    [skus, draft],
  );

  async function handleSave() {
    const updates = skus
      .filter((s) => {
        const current = (draft[s.sku_id] ?? "").trim();
        const original = formatCogsInput(s.unit_cogs).trim();
        return current !== original;
      })
      .map((s) => ({
        sku_id: s.sku_id,
        unit_cogs_raw: draft[s.sku_id] ?? "",
      }));

    if (updates.length === 0) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/skus/cogs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      const rows = (data.skus ?? []) as SkuCogsRow[];
      setSkus(rows);
      setDraft(
        Object.fromEntries(
          rows.map((r) => [r.sku_id, formatCogsInput(r.unit_cogs)]),
        ),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/dashboard/mappings"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to SKUs & Franchises
          </Link>
          <h1 className="text-2xl font-semibold text-stone-900">COGS</h1>
          <p className="mt-1 text-stone-600">
            Unit cost of goods sold per SKU. This will feed franchise
            profitability analysis — comparing sales contribution against margin,
            and restock viability using MOQ and stock months.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || changedCount === 0}>
          <Save className="h-4 w-4" />
          {saving
            ? "Saving..."
            : changedCount > 0
              ? `Save ${changedCount} change${changedCount === 1 ? "" : "s"}`
              : "Save"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-stone-500">SKUs with COGS</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {pricedCount} / {skus.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-stone-500">Unsaved changes</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {changedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Unit COGS by SKU</CardTitle>
              <CardDescription>
                {filtered.length} of {skus.length} franchise-mapped single SKUs.
                Costs in IDR. Gross margin uses RSP (Harga) from sales uploads
                when available.
              </CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-9"
                placeholder="Search SKU, product, franchise…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-stone-500">
              No franchise-mapped SKUs found. Add SKUs from SKUs & Franchises
              first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4">SKU</th>
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Franchise</th>
                    <th className="py-2 pr-4 text-right">RSP</th>
                    <th className="py-2 pr-4 text-right">Unit COGS</th>
                    <th className="py-2 text-right">Gross margin</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const draftValue = draft[row.sku_id] ?? "";
                    const parsedCogs = draftValue.trim()
                      ? Number(draftValue.replace(/,/g, ""))
                      : null;
                    const margin = grossMarginPct(
                      row.retail_price,
                      parsedCogs != null && Number.isFinite(parsedCogs)
                        ? parsedCogs
                        : null,
                    );

                    return (
                      <tr
                        key={row.sku_id}
                        className="border-b border-stone-100"
                      >
                        <td className="py-2.5 pr-4 font-mono text-xs">
                          {row.sku_code}
                        </td>
                        <td className="py-2.5 pr-4 text-stone-700">
                          {row.product_name ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-stone-600">
                          {row.franchise_name ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-stone-600">
                          {row.retail_price != null
                            ? formatCurrency(row.retail_price)
                            : "—"}
                        </td>
                        <td className="py-2.5 pr-4">
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={draftValue}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [row.sku_id]: e.target.value,
                              }))
                            }
                            className="h-8 w-36 text-right tabular-nums"
                          />
                        </td>
                        <td
                          className={`py-2.5 text-right tabular-nums ${marginClass(margin)}`}
                        >
                          {margin != null ? formatPct(margin) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {saved && !error && (
            <p className="mt-4 text-sm text-emerald-700">Changes saved.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
