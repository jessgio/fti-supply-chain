"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FlaskConical, Plus, Trash2 } from "lucide-react";
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
import type { ExtractSummary, ProductExtractFormula } from "@/types/database";

type SkuSearchOption = {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_name?: string | null;
};

function ExtractFormulasInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productFromUrl = searchParams.get("product");

  const [products, setProducts] = useState<SkuSearchOption[]>([]);
  const [extracts, setExtracts] = useState<ExtractSummary[]>([]);
  const [formulas, setFormulas] = useState<ProductExtractFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<SkuSearchOption | null>(
    null,
  );
  const [addExtractId, setAddExtractId] = useState("");
  const [addKgPerUnit, setAddKgPerUnit] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [productFilter, setProductFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, extractsRes, formulasRes] = await Promise.all([
        fetch("/api/packaging/products"),
        fetch("/api/extracts?sort=item_no&sort_dir=asc"),
        fetch("/api/extracts/formulas"),
      ]);
      const productsData = await productsRes.json();
      const extractsData = await extractsRes.json();
      const formulasData = await formulasRes.json();
      if (!productsRes.ok) {
        throw new Error(productsData.error ?? "Failed to load products");
      }
      if (!extractsRes.ok) {
        throw new Error(extractsData.error ?? "Failed to load extracts");
      }
      if (!formulasRes.ok) {
        throw new Error(formulasData.error ?? "Failed to load formulas");
      }
      setProducts(productsData.products ?? []);
      setExtracts(extractsData.extracts ?? []);
      setFormulas(formulasData.formulas ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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
    router.replace(qs ? `?${qs}` : "/dashboard/extracts/formulas", {
      scroll: false,
    });
  }

  const formulasByProduct = useMemo(() => {
    const map = new Map<string, ProductExtractFormula[]>();
    for (const formula of formulas) {
      const list = map.get(formula.product_sku_id) ?? [];
      list.push(formula);
      map.set(formula.product_sku_id, list);
    }
    return map;
  }, [formulas]);

  const productFormulas = selectedProduct
    ? (formulasByProduct.get(selectedProduct.id) ?? [])
    : [];

  const filteredProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.sku_code.toLowerCase().includes(q) ||
        (p.name?.toLowerCase().includes(q) ?? false),
    );
  }, [products, productFilter]);

  async function handleAdd() {
    if (!selectedProduct) {
      setError("Select a finished-good SKU first.");
      return;
    }
    if (!addExtractId) {
      setError("Select an extract.");
      return;
    }
    const kg = Number(addKgPerUnit);
    if (!Number.isFinite(kg) || kg <= 0) {
      setError("Enter a positive kg per unit value.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/extracts/formulas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_sku_id: selectedProduct.id,
          extract_id: addExtractId,
          extract_kg_per_unit: kg,
          notes: addNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setFormulas((prev) => [data.formula, ...prev]);
      setAddExtractId("");
      setAddKgPerUnit("");
      setAddNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(
    formula: ProductExtractFormula,
    patch: {
      extract_id?: string;
      extract_kg_per_unit?: number;
      notes?: string | null;
    },
  ) {
    setError(null);
    try {
      const res = await fetch(`/api/extracts/formulas/${formula.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setFormulas((prev) =>
        prev.map((f) => (f.id === formula.id ? data.formula : f)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleUpdateKg(formula: ProductExtractFormula, value: string) {
    const kg = Number(value);
    if (!Number.isFinite(kg) || kg <= 0) return;
    if (kg === formula.extract_kg_per_unit) return;
    await handleUpdate(formula, { extract_kg_per_unit: kg });
  }

  async function handleUpdateNotes(
    formula: ProductExtractFormula,
    value: string,
  ) {
    const notes = value.trim() || null;
    if (notes === (formula.notes ?? null)) return;
    await handleUpdate(formula, { notes });
  }

  async function handleUpdateExtract(
    formula: ProductExtractFormula,
    extractId: string,
  ) {
    if (!extractId || extractId === formula.extract_id) return;
    await handleUpdate(formula, { extract_id: extractId });
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this formula?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/extracts/formulas/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setFormulas((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleDeleteAllForProduct() {
    if (!selectedProduct || productFormulas.length === 0) return;
    if (
      !confirm(
        `Remove all ${productFormulas.length} formula${
          productFormulas.length === 1 ? "" : "s"
        } for ${selectedProduct.sku_code}?`,
      )
    ) {
      return;
    }
    setError(null);
    const ids = productFormulas.map((f) => f.id);
    try {
      await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/extracts/formulas/${id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to delete");
        }),
      );
      setFormulas((prev) => prev.filter((f) => !ids.includes(f.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      await load();
    }
  }

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
            <FlaskConical className="h-6 w-6 text-emerald-800" />
            <h1 className="text-2xl font-semibold text-stone-900">
              Extract formulas
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-stone-600">
            Predetermined extract usage per finished unit for production
            reconciliation.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Finished goods</CardTitle>
            <CardDescription>
              Select a SKU to manage its extract formulas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Filter SKUs…"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            />
            <div className="max-h-[24rem] space-y-1 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-stone-500">Loading…</p>
              ) : (
                filteredProducts.map((product) => {
                  const count =
                    formulasByProduct.get(product.id)?.length ?? 0;
                  const active = selectedProduct?.id === product.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => selectProduct(product)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                          : "hover:bg-stone-50"
                      }`}
                    >
                      <span className="font-medium">{product.sku_code}</span>
                      {product.name && (
                        <span className="mt-0.5 block truncate text-xs text-stone-500">
                          {product.name}
                        </span>
                      )}
                      {count > 0 && (
                        <span className="mt-0.5 block text-xs text-stone-400">
                          {count} formula{count === 1 ? "" : "s"}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    {selectedProduct
                      ? `Formulas — ${selectedProduct.sku_code}`
                      : "Select a product"}
                  </CardTitle>
                  <CardDescription>
                    kg of extract consumed per finished unit (pc). Used to
                    compare against actual production ledger usage. Edit values
                    inline; changes save when you leave the field.
                  </CardDescription>
                </div>
                {selectedProduct && productFormulas.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    onClick={() => void handleDeleteAllForProduct()}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove all
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedProduct ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-500">
                        Extract
                      </label>
                      <select
                        className="h-9 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"
                        value={addExtractId}
                        onChange={(e) => setAddExtractId(e.target.value)}
                      >
                        <option value="">Select extract…</option>
                        {extracts.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.item_no}
                            {ex.description ? ` — ${ex.description}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-500">
                        kg / pc
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="text-right"
                        value={addKgPerUnit}
                        onChange={(e) => setAddKgPerUnit(e.target.value)}
                        placeholder="0.000001"
                      />
                    </div>
                    <Button disabled={saving} onClick={() => void handleAdd()}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                  />

                  {productFormulas.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      No formulas for this SKU yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-stone-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-stone-50 text-stone-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Extract</th>
                            <th className="px-3 py-2 text-right font-medium">
                              kg / pc
                            </th>
                            <th className="px-3 py-2 font-medium">Notes</th>
                            <th className="px-3 py-2 w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {productFormulas.map((formula) => (
                            <tr
                              key={formula.id}
                              className="border-t border-stone-100"
                            >
                              <td className="px-3 py-2">
                                <select
                                  className="h-8 w-full min-w-[12rem] rounded-lg border border-stone-300 bg-white px-2 text-xs"
                                  value={formula.extract_id}
                                  onChange={(e) =>
                                    void handleUpdateExtract(
                                      formula,
                                      e.target.value,
                                    )
                                  }
                                  aria-label={`Extract for ${formula.extract_item_no}`}
                                >
                                  {extracts.map((ex) => (
                                    <option key={ex.id} value={ex.id}>
                                      {ex.item_no}
                                      {ex.description
                                        ? ` — ${ex.description}`
                                        : ""}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Input
                                  key={`${formula.id}-kg-${formula.extract_kg_per_unit}`}
                                  type="number"
                                  min="0"
                                  step="any"
                                  className="ml-auto h-8 w-28 text-right text-xs"
                                  defaultValue={String(
                                    formula.extract_kg_per_unit,
                                  )}
                                  onBlur={(e) =>
                                    void handleUpdateKg(
                                      formula,
                                      e.target.value,
                                    )
                                  }
                                  aria-label={`kg per unit for ${formula.extract_item_no}`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  key={`${formula.id}-notes-${formula.notes ?? ""}`}
                                  className="h-8 text-xs"
                                  defaultValue={formula.notes ?? ""}
                                  placeholder="—"
                                  onBlur={(e) =>
                                    void handleUpdateNotes(
                                      formula,
                                      e.target.value,
                                    )
                                  }
                                  aria-label={`Notes for ${formula.extract_item_no}`}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(formula.id)}
                                  className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                                  aria-label={`Delete formula for ${formula.extract_item_no}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-stone-500">
                  Choose a finished-good SKU from the list to add or edit extract
                  formulas.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4" />
                All formulas
              </CardTitle>
              <CardDescription>
                Edit kg or notes inline, or remove a formula with the trash
                icon.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {formulas.length === 0 ? (
                <p className="text-sm text-stone-500">No formulas defined yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2 pr-4 font-medium">Product</th>
                      <th className="py-2 pr-4 font-medium">Extract</th>
                      <th className="py-2 pr-4 text-right font-medium">
                        kg / pc
                      </th>
                      <th className="py-2 pr-4 font-medium">Notes</th>
                      <th className="py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {formulas.map((f) => (
                      <tr key={f.id} className="border-b border-stone-100">
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            className="text-left font-medium hover:underline"
                            onClick={() => {
                              const product = products.find(
                                (p) => p.id === f.product_sku_id,
                              );
                              if (product) selectProduct(product);
                            }}
                          >
                            {f.product_sku_code}
                          </button>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className="h-8 w-full min-w-[10rem] rounded-lg border border-stone-300 bg-white px-2 text-xs"
                            value={f.extract_id}
                            onChange={(e) =>
                              void handleUpdateExtract(f, e.target.value)
                            }
                            aria-label={`Extract for ${f.product_sku_code}`}
                          >
                            {extracts.map((ex) => (
                              <option key={ex.id} value={ex.id}>
                                {ex.item_no}
                                {ex.description
                                  ? ` — ${ex.description}`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <Input
                            key={`${f.id}-all-kg-${f.extract_kg_per_unit}`}
                            type="number"
                            min="0"
                            step="any"
                            className="ml-auto h-8 w-28 text-right text-xs"
                            defaultValue={String(f.extract_kg_per_unit)}
                            onBlur={(e) =>
                              void handleUpdateKg(f, e.target.value)
                            }
                            aria-label={`kg per unit for ${f.product_sku_code} / ${f.extract_item_no}`}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            key={`${f.id}-all-notes-${f.notes ?? ""}`}
                            className="h-8 text-xs"
                            defaultValue={f.notes ?? ""}
                            placeholder="—"
                            onBlur={(e) =>
                              void handleUpdateNotes(f, e.target.value)
                            }
                            aria-label={`Notes for ${f.product_sku_code} / ${f.extract_item_no}`}
                          />
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => void handleDelete(f.id)}
                            className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Delete formula for ${f.product_sku_code} / ${f.extract_item_no}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

export default function ExtractFormulasPage() {
  return (
    <Suspense
      fallback={
        <PageShell wide>
          <p className="text-sm text-stone-500">Loading…</p>
        </PageShell>
      }
    >
      <ExtractFormulasInner />
    </Suspense>
  );
}
