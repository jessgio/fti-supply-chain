"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Link2, Plus, Trash2 } from "lucide-react";
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
import { DEFAULT_TARGET_STOCK_MONTHS } from "@/lib/forecast/demand";
import { downloadPackagingBomXlsx } from "@/lib/packaging/export-bom-xlsx";
import { formatNumber } from "@/lib/utils";
import type { ProductPackagingLink } from "@/types/database";

function PackagingLinksInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productFromUrl = searchParams.get("product");
  const [products, setProducts] = useState<SkuSearchOption[]>([]);
  const [packagingSkus, setPackagingSkus] = useState<SkuSearchOption[]>([]);
  const [links, setLinks] = useState<ProductPackagingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<SkuSearchOption | null>(
    null,
  );
  const [addPackaging, setAddPackaging] = useState<SkuSearchOption | null>(null);
  const [addQty, setAddQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [productFilter, setProductFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, linksRes, skusRes] = await Promise.all([
        fetch("/api/packaging/products"),
        fetch("/api/packaging/links"),
        fetch("/api/packaging/skus"),
      ]);
      const productsData = await productsRes.json();
      const linksData = await linksRes.json();
      const skusData = await skusRes.json();
      if (!productsRes.ok) throw new Error(productsData.error ?? "Failed to load");
      if (!linksRes.ok) throw new Error(linksData.error ?? "Failed to load");
      if (!skusRes.ok) throw new Error(skusData.error ?? "Failed to load");

      setProducts(productsData.products ?? []);
      setLinks(linksData.links ?? []);
      setPackagingSkus(
        (skusData.skus ?? [])
          .filter((s: { is_packaging: boolean }) => s.is_packaging)
          .map(
            (s: {
              id: string;
              sku_code: string;
              name: string | null;
              franchise_name: string | null;
            }) => ({
              id: s.id,
              sku_code: s.sku_code,
              name: s.name,
              franchise_name: s.franchise_name,
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
    if (!productFromUrl || loading || products.length === 0) return;
    const product = products.find((p) => p.id === productFromUrl) ?? null;
    if (product) {
      setSelectedProduct((current) =>
        current?.id === product.id ? current : product,
      );
    }
  }, [productFromUrl, loading, products]);

  function selectProduct(product: SkuSearchOption | null) {
    setSelectedProduct(product);
    const params = new URLSearchParams(searchParams.toString());
    if (product) params.set("product", product.id);
    else params.delete("product");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/dashboard/packaging/links", {
      scroll: false,
    });
  }

  const linksByProduct = useMemo(() => {
    const map = new Map<string, ProductPackagingLink[]>();
    for (const link of links) {
      const list = map.get(link.product_sku_id) ?? [];
      list.push(link);
      map.set(link.product_sku_id, list);
    }
    return map;
  }, [links]);

  const productLinks = selectedProduct
    ? (linksByProduct.get(selectedProduct.id) ?? [])
    : [];

  const availablePackaging = useMemo(() => {
    const linked = new Set(productLinks.map((l) => l.packaging_sku_id));
    return packagingSkus.filter((s) => !linked.has(s.id));
  }, [packagingSkus, productLinks]);

  const productsWithLinks = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    return products
      .filter((p) => linksByProduct.has(p.id))
      .filter((p) => {
        if (!q) return true;
        return [p.sku_code, p.name ?? "", p.franchise_name ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.sku_code.localeCompare(b.sku_code));
  }, [products, linksByProduct, productFilter]);

  async function addPackagingLink() {
    if (!selectedProduct || !addPackaging) return;
    const qty = Number(addQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity per unit must be greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/packaging/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_sku_id: selectedProduct.id,
          packaging_sku_id: addPackaging.id,
          qty_per_unit: qty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setLinks((prev) => [...prev, data.link]);
      setAddPackaging(null);
      setAddQty("1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function updateQty(link: ProductPackagingLink, qtyStr: string) {
    const qty = Number(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (qty === link.qty_per_unit) return;
    setError(null);
    try {
      const res = await fetch(`/api/packaging/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty_per_unit: qty }),
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
      const res = await fetch(`/api/packaging/links/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove");
      setLinks((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  function selectProductById(id: string) {
    const product = products.find((p) => p.id === id) ?? null;
    selectProduct(product);
  }

  async function handleExportXlsx() {
    setExporting(true);
    setError(null);
    try {
      await downloadPackagingBomXlsx(links);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/packaging"
            className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to packaging
          </Link>
          <div className="flex items-center gap-2">
            <Link2 className="h-6 w-6 text-emerald-800" />
            <h1 className="text-2xl font-semibold text-stone-900">
              Packaging bill of materials
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-stone-600">
            Pick a finished good, then add every packaging component it uses.
            Suggested packaging PO quantities on the main page are calculated from
            these links and the {DEFAULT_TARGET_STOCK_MONTHS}-month finished-goods
            restock batch in Inventory.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading || exporting || links.length === 0}
          onClick={() => void handleExportXlsx()}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Export XLSX"}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(14rem,18rem)_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Products with BOM</CardTitle>
            <CardDescription>
              {productsWithLinks.length} finished good
              {productsWithLinks.length === 1 ? "" : "s"} linked
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Filter list…"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            />
            {loading ? (
              <p className="text-sm text-stone-500">Loading…</p>
            ) : productsWithLinks.length === 0 ? (
              <p className="text-sm text-stone-500">
                No links yet. Search for a finished good on the right to start.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {productsWithLinks.map((product) => {
                  const count = linksByProduct.get(product.id)?.length ?? 0;
                  const active = selectedProduct?.id === product.id;
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => selectProductById(product.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? "bg-emerald-700 text-white"
                            : "hover:bg-stone-100"
                        }`}
                      >
                        <span className="block font-mono text-xs">
                          {product.sku_code}
                        </span>
                        <span
                          className={`block truncate text-xs ${active ? "text-emerald-100" : "text-stone-500"}`}
                        >
                          {count} packaging component{count === 1 ? "" : "s"}
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
            <CardTitle className="text-base">Finished good</CardTitle>
            <CardDescription>
              Search by SKU code, product name, or franchise — then add each
              packaging item below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SkuSearchInput
              options={products}
              value={selectedProduct}
              onChange={selectProduct}
              placeholder="Type SKU code, name, or franchise…"
              disabled={loading}
            />

            {!selectedProduct ? (
              <p className="text-sm text-stone-500">
                Select a finished good to view or edit its packaging bill of
                materials.
              </p>
            ) : (
              <>
                <div className="rounded-lg bg-stone-50 px-4 py-3">
                  <p className="font-mono text-sm font-medium text-stone-900">
                    {selectedProduct.sku_code}
                  </p>
                  <p className="text-sm text-stone-600">
                    {[selectedProduct.franchise_name, selectedProduct.name]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium text-stone-800">
                    Packaging components
                  </h3>
                  {productLinks.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      No packaging linked yet. Add components below.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-stone-200">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                            <th className="px-3 py-2">Packaging SKU</th>
                            <th className="px-3 py-2 text-right">Qty / FG unit</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {productLinks.map((link) => (
                            <tr
                              key={link.id}
                              className="border-b border-stone-100 last:border-0"
                            >
                              <td className="px-3 py-2">
                                <span className="font-mono text-xs">
                                  {link.packaging_sku_code}
                                </span>
                                {link.packaging_name && (
                                  <span className="block text-xs text-stone-500">
                                    {link.packaging_name}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Input
                                  className="ml-auto w-24 text-right"
                                  type="number"
                                  min="0"
                                  step="any"
                                  defaultValue={String(link.qty_per_unit)}
                                  onBlur={(e) => updateQty(link, e.target.value)}
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
                    Add packaging component
                  </h3>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <SkuSearchInput
                      options={availablePackaging}
                      value={addPackaging}
                      onChange={setAddPackaging}
                      placeholder="Search packaging SKU…"
                      disabled={saving || availablePackaging.length === 0}
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
                      onClick={addPackagingLink}
                      disabled={
                        saving || !addPackaging || availablePackaging.length === 0
                      }
                    >
                      <Plus className="h-4 w-4" />
                      {saving ? "Adding…" : "Add"}
                    </Button>
                  </div>
                  {availablePackaging.length === 0 && packagingSkus.length > 0 && (
                    <p className="mt-2 text-xs text-stone-500">
                      All packaging SKUs are already linked to this product.
                    </p>
                  )}
                  {packagingSkus.length === 0 && (
                    <p className="mt-2 text-xs text-stone-500">
                      Mark SKUs as packaging on the main Packaging page first.
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
            <CardTitle className="text-base">All links</CardTitle>
            <CardDescription>
              {formatNumber(links.length)} connection
              {links.length === 1 ? "" : "s"} across all products
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">Finished good</th>
                    <th className="px-3 py-2">Packaging</th>
                    <th className="px-3 py-2 text-right">Qty / unit</th>
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
                          onClick={() => selectProductById(link.product_sku_id)}
                        >
                          {link.product_sku_code}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {link.packaging_sku_code}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(link.qty_per_unit)}
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

export default function PackagingLinksPage() {
  return (
    <Suspense
      fallback={
        <PageShell wide>
          <p className="text-sm text-stone-500">Loading…</p>
        </PageShell>
      }
    >
      <PackagingLinksInner />
    </Suspense>
  );
}
