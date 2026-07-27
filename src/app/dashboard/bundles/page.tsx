"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Boxes, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/utils";
import type { BundleBomLink, BundleSkuOption } from "@/types/database";

type BomFilter = "all" | "missing" | "set";

function BundleBomInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bundleFromUrl = searchParams.get("bundle");
  const [bundles, setBundles] = useState<BundleSkuOption[]>([]);
  const [componentSkus, setComponentSkus] = useState<SkuSearchOption[]>([]);
  const [links, setLinks] = useState<BundleBomLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<BundleSkuOption | null>(
    null,
  );
  const [addComponent, setAddComponent] = useState<SkuSearchOption | null>(null);
  const [addQty, setAddQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [bundleFilter, setBundleFilter] = useState("");
  const [bomFilter, setBomFilter] = useState<BomFilter>("missing");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bundlesRes, linksRes, skusRes] = await Promise.all([
        fetch("/api/bundles"),
        fetch("/api/bundles/components"),
        fetch("/api/bundles/component-skus"),
      ]);
      const bundlesData = await bundlesRes.json();
      const linksData = await linksRes.json();
      const skusData = await skusRes.json();
      if (!bundlesRes.ok) throw new Error(bundlesData.error ?? "Failed to load");
      if (!linksRes.ok) throw new Error(linksData.error ?? "Failed to load");
      if (!skusRes.ok) throw new Error(skusData.error ?? "Failed to load");

      setBundles(bundlesData.bundles ?? []);
      setLinks(linksData.links ?? []);
      setComponentSkus(
        (skusData.skus ?? []).map(
          (s: {
            id: string;
            sku_code: string;
            name: string | null;
            franchise_name: string | null;
            is_active: boolean;
          }) => ({
            id: s.id,
            sku_code: s.sku_code,
            name: s.name,
            franchise_name: s.franchise_name,
            is_active: s.is_active,
          }),
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

  useEffect(() => {
    if (!bundleFromUrl || loading || bundles.length === 0) return;
    const bundle = bundles.find((b) => b.id === bundleFromUrl) ?? null;
    if (bundle) {
      setSelectedBundle((current) =>
        current?.id === bundle.id ? current : bundle,
      );
    }
  }, [bundleFromUrl, loading, bundles]);

  function selectBundle(bundle: BundleSkuOption | null) {
    setSelectedBundle(bundle);
    const params = new URLSearchParams(searchParams.toString());
    if (bundle) params.set("bundle", bundle.id);
    else params.delete("bundle");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/dashboard/bundles", { scroll: false });
  }

  const linksByBundle = useMemo(() => {
    const map = new Map<string, BundleBomLink[]>();
    for (const link of links) {
      const list = map.get(link.bundle_sku_id) ?? [];
      list.push(link);
      map.set(link.bundle_sku_id, list);
    }
    return map;
  }, [links]);

  const bundlesWithCounts = useMemo(() => {
    return bundles.map((b) => ({
      ...b,
      // Prefer live link count; fall back to API count if links were truncated.
      component_count: Math.max(
        b.component_count,
        linksByBundle.get(b.id)?.length ?? 0,
      ),
    }));
  }, [bundles, linksByBundle]);

  const missingCount = useMemo(
    () => bundlesWithCounts.filter((b) => b.component_count === 0).length,
    [bundlesWithCounts],
  );
  const setCount = bundlesWithCounts.length - missingCount;

  const filteredBundles = useMemo(() => {
    const q = bundleFilter.trim().toLowerCase();
    return bundlesWithCounts
      .filter((b) => {
        if (bomFilter === "missing") return b.component_count === 0;
        if (bomFilter === "set") return b.component_count > 0;
        return true;
      })
      .filter((b) => {
        if (!q) return true;
        return [b.sku_code, b.name ?? ""].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.component_count === 0 && b.component_count > 0) return -1;
        if (a.component_count > 0 && b.component_count === 0) return 1;
        return a.sku_code.localeCompare(b.sku_code);
      });
  }, [bundlesWithCounts, bundleFilter, bomFilter]);

  const bundleLinks = selectedBundle
    ? (linksByBundle.get(selectedBundle.id) ?? [])
    : [];

  const availableComponents = useMemo(() => {
    const linked = new Set(bundleLinks.map((l) => l.component_sku_id));
    return componentSkus.filter((s) => !linked.has(s.id));
  }, [componentSkus, bundleLinks]);

  const searchOptions: SkuSearchOption[] = useMemo(
    () =>
      bundlesWithCounts.map((b) => ({
        id: b.id,
        sku_code: b.sku_code,
        name: b.name,
        is_bundle: true,
        is_active: b.is_active,
      })),
    [bundlesWithCounts],
  );

  async function addComponentLink() {
    if (!selectedBundle || !addComponent) return;
    const qty = Number(addQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity per bundle must be greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bundles/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundle_sku_id: selectedBundle.id,
          component_sku_id: addComponent.id,
          qty_per_bundle: qty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setLinks((prev) => {
        const next = data.link as BundleBomLink;
        const idx = prev.findIndex(
          (row) =>
            row.id === next.id ||
            (row.bundle_sku_id === next.bundle_sku_id &&
              row.component_sku_id === next.component_sku_id),
        );
        if (idx >= 0) {
          return prev.map((row, i) => (i === idx ? next : row));
        }
        return [...prev, next];
      });
      setAddComponent(null);
      setAddQty("1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function updateQty(link: BundleBomLink, qtyStr: string) {
    const qty = Number(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (qty === link.qty_per_bundle) return;
    setError(null);
    try {
      const res = await fetch(`/api/bundles/components/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty_per_bundle: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setLinks((prev) =>
        prev.map((row) => (row.id === data.link.id ? data.link : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function removeLink(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/bundles/components/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove");
      setLinks((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  function selectBundleById(id: string) {
    const bundle = bundlesWithCounts.find((b) => b.id === id) ?? null;
    selectBundle(bundle);
  }

  const selectedSearchValue: SkuSearchOption | null = selectedBundle
    ? {
        id: selectedBundle.id,
        sku_code: selectedBundle.sku_code,
        name: selectedBundle.name,
        is_bundle: true,
        is_active: selectedBundle.is_active,
      }
    : null;

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/inventory"
            className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
          >
            ← Back to inventory
          </Link>
          <div className="flex items-center gap-2">
            <Boxes className="h-6 w-6 text-emerald-800" />
            <h1 className="text-2xl font-semibold text-stone-900">
              Bundle bill of materials
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-stone-600">
            Find bundles missing a BOM and set which single SKUs they contain —
            no Excel re-upload required. Bundle sales explode into these
            components for forecast and stock.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Bundle SKUs"
          value={loading ? "…" : formatNumber(bundlesWithCounts.length)}
          onClick={() => setBomFilter("all")}
          active={bomFilter === "all"}
        />
        <StatCard
          label="BOM set"
          value={loading ? "…" : formatNumber(setCount)}
          tone="success"
          onClick={() => setBomFilter("set")}
          active={bomFilter === "set"}
        />
        <StatCard
          label="Missing BOM"
          value={loading ? "…" : formatNumber(missingCount)}
          tone={missingCount > 0 ? "warning" : "default"}
          onClick={() => setBomFilter("missing")}
          active={bomFilter === "missing"}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && missingCount > 0 && bomFilter !== "missing" && (
        <button
          type="button"
          onClick={() => setBomFilter("missing")}
          className="flex w-full items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">
              {missingCount} bundle{missingCount === 1 ? "" : "s"}{" "}
              {missingCount === 1 ? "has" : "have"} no components yet.
            </span>{" "}
            Click to filter the list and set their BOM.
          </span>
        </button>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(14rem,18rem)_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bundles</CardTitle>
            <CardDescription>
              {filteredBundles.length} shown
              {bomFilter === "missing"
                ? " · missing BOM"
                : bomFilter === "set"
                  ? " · with BOM"
                  : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["missing", "Missing"],
                  ["set", "Set"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBomFilter(value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    bomFilter === value
                      ? value === "missing"
                        ? "bg-amber-700 text-white"
                        : "bg-emerald-700 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {label}
                  {value === "missing" && missingCount > 0
                    ? ` (${missingCount})`
                    : ""}
                </button>
              ))}
            </div>
            <Input
              placeholder="Filter list…"
              value={bundleFilter}
              onChange={(e) => setBundleFilter(e.target.value)}
            />
            {loading ? (
              <p className="text-sm text-stone-500">Loading…</p>
            ) : filteredBundles.length === 0 ? (
              <p className="text-sm text-stone-500">
                {bomFilter === "missing"
                  ? "Every bundle already has a BOM."
                  : bomFilter === "set"
                    ? "No bundles with a BOM yet."
                    : "No bundle SKUs found. Create one on Master Data first."}
              </p>
            ) : (
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {filteredBundles.map((bundle) => {
                  const count = bundle.component_count;
                  const active = selectedBundle?.id === bundle.id;
                  const missing = count === 0;
                  return (
                    <li key={bundle.id}>
                      <button
                        type="button"
                        onClick={() => selectBundleById(bundle.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? "bg-emerald-700 text-white"
                            : missing
                              ? "bg-amber-50 hover:bg-amber-100"
                              : "hover:bg-stone-100"
                        }`}
                      >
                        <span className="block font-mono text-xs">
                          {bundle.sku_code}
                        </span>
                        <span
                          className={`block truncate text-xs ${
                            active
                              ? "text-emerald-100"
                              : missing
                                ? "text-amber-700"
                                : "text-stone-500"
                          }`}
                        >
                          {missing
                            ? "No BOM"
                            : `${count} component${count === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bundle</CardTitle>
            <CardDescription>
              Search by SKU code or name — then add each component SKU and
              quantity per bundle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SkuSearchInput
              options={searchOptions}
              value={selectedSearchValue}
              onChange={(option) => {
                if (!option) {
                  selectBundle(null);
                  return;
                }
                selectBundleById(option.id);
              }}
              placeholder="Type bundle SKU code or name…"
              disabled={loading}
            />

            {!selectedBundle ? (
              <p className="text-sm text-stone-500">
                Select a bundle to view or edit its bill of materials.
              </p>
            ) : (
              <>
                <div
                  className={`rounded-lg px-4 py-3 ${
                    bundleLinks.length === 0 ? "bg-amber-50" : "bg-stone-50"
                  }`}
                >
                  <p className="font-mono text-sm font-medium text-stone-900">
                    {selectedBundle.sku_code}
                  </p>
                  <p className="text-sm text-stone-600">
                    {selectedBundle.name || "—"}
                  </p>
                  {bundleLinks.length === 0 && (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      This bundle has no BOM yet. Add components below.
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium text-stone-800">
                    Components
                  </h3>
                  {bundleLinks.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      No components linked yet. Add SKUs below.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-stone-200">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                            <th className="px-3 py-2">Component SKU</th>
                            <th className="px-3 py-2 text-right">
                              Qty / bundle
                            </th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {bundleLinks.map((link) => (
                            <tr
                              key={link.id}
                              className="border-b border-stone-100 last:border-0"
                            >
                              <td className="px-3 py-2">
                                <span className="font-mono text-xs">
                                  {link.component_sku_code}
                                </span>
                                {link.component_name && (
                                  <span className="block text-xs text-stone-500">
                                    {link.component_name}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Input
                                  className="ml-auto w-24 text-right"
                                  type="number"
                                  min="0"
                                  step="any"
                                  defaultValue={String(link.qty_per_bundle)}
                                  onBlur={(e) =>
                                    updateQty(link, e.target.value)
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeLink(link.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-dashed border-stone-300 p-4">
                  <h3 className="mb-3 text-sm font-medium text-stone-800">
                    Add component
                  </h3>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <SkuSearchInput
                      options={availableComponents}
                      value={addComponent}
                      onChange={setAddComponent}
                      placeholder="Search single SKU…"
                      disabled={saving || availableComponents.length === 0}
                    />
                    <Input
                      className="w-28"
                      type="number"
                      min="0"
                      step="any"
                      value={addQty}
                      onChange={(e) => setAddQty(e.target.value)}
                      placeholder="Qty"
                    />
                    <Button
                      onClick={addComponentLink}
                      disabled={
                        saving ||
                        !addComponent ||
                        availableComponents.length === 0
                      }
                    >
                      <Plus className="h-4 w-4" />
                      {saving ? "Adding…" : "Add"}
                    </Button>
                  </div>
                  {availableComponents.length === 0 &&
                    componentSkus.length > 0 && (
                      <p className="mt-2 text-xs text-stone-500">
                        All available SKUs are already linked to this bundle.
                      </p>
                    )}
                  {componentSkus.length === 0 && (
                    <p className="mt-2 text-xs text-stone-500">
                      No single SKUs found. Add products on Master Data first.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All BOM lines</CardTitle>
            <CardDescription>
              {formatNumber(links.length)} component link
              {links.length === 1 ? "" : "s"} across all bundles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">Bundle</th>
                    <th className="px-3 py-2">Component</th>
                    <th className="px-3 py-2 text-right">Qty / bundle</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr
                      key={link.id}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left font-mono text-xs hover:underline"
                          onClick={() => selectBundleById(link.bundle_sku_id)}
                        >
                          {link.bundle_sku_code}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {link.component_sku_code}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(link.qty_per_bundle)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeLink(link.id)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

export default function BundleBomPage() {
  return (
    <Suspense
      fallback={
        <PageShell wide>
          <p className="text-sm text-stone-500">Loading…</p>
        </PageShell>
      }
    >
      <BundleBomInner />
    </Suspense>
  );
}
