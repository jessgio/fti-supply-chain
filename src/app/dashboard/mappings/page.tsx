"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const franchiseColumns = ["sku_code", "sku_name", "franchise_name"];

const bundleColumns = [
  "bundle_sku_code",
  "component_sku_code",
  "qty_per_bundle",
];

interface SkuRow {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_active: boolean;
  franchise_id: string | null;
  franchise_name: string | null;
}

type StatusFilter = "all" | "active" | "inactive";

interface FranchiseOption {
  id: string;
  name: string;
}

export default function MappingsPage() {
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingFranchiseId, setEditingFranchiseId] = useState<string | null>(
    null,
  );
  const [newFranchiseName, setNewFranchiseName] = useState("");
  const [addSkuCode, setAddSkuCode] = useState("");
  const [addSkuName, setAddSkuName] = useState("");
  const [addFranchiseId, setAddFranchiseId] = useState("");
  const [addFranchiseName, setAddFranchiseName] = useState("");
  const [addIsBundle, setAddIsBundle] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const loadSkus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/skus");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load SKUs");
      setSkus(data.skus ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SKUs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkus();
  }, [loadSkus]);

  useEffect(() => {
    fetch("/api/metadata")
      .then((res) => res.json())
      .then((data) => {
        if (data.franchises) setFranchises(data.franchises);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skus.filter((sku) => {
      if (statusFilter === "active" && !sku.is_active) return false;
      if (statusFilter === "inactive" && sku.is_active) return false;
      if (!q) return true;
      return (
        sku.sku_code.toLowerCase().includes(q) ||
        (sku.name?.toLowerCase().includes(q) ?? false) ||
        (sku.franchise_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [skus, search, statusFilter]);

  const inactiveCount = skus.filter((s) => !s.is_active && !s.is_bundle).length;

  const franchiseOptions = useMemo(() => {
    const byId = new Map(franchises.map((f) => [f.id, f]));
    for (const sku of skus) {
      if (
        sku.franchise_id &&
        sku.franchise_name &&
        !byId.has(sku.franchise_id)
      ) {
        byId.set(sku.franchise_id, {
          id: sku.franchise_id,
          name: sku.franchise_name,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [franchises, skus]);

  async function updateFranchise(
    sku: SkuRow,
    franchiseId: string,
    franchiseName?: string,
  ) {
    if (sku.is_bundle) return;
    if (!franchiseName && (!franchiseId || franchiseId === sku.franchise_id)) {
      return;
    }

    setUpdatingId(sku.id);
    setError(null);
    try {
      const body: Record<string, string> = franchiseName
        ? { franchise_name: franchiseName }
        : { franchise_id: franchiseId };

      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");

      const updated = data.sku as SkuRow;
      setSkus((prev) =>
        prev.map((row) => (row.id === sku.id ? { ...row, ...updated } : row)),
      );

      if (updated.franchise_id && updated.franchise_name) {
        setFranchises((prev) => {
          if (prev.some((f) => f.id === updated.franchise_id)) return prev;
          return [
            ...prev,
            { id: updated.franchise_id!, name: updated.franchise_name! },
          ].sort((a, b) => a.name.localeCompare(b.name));
        });
      }

      setEditingFranchiseId(null);
      setNewFranchiseName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function updateProductName(sku: SkuRow, name: string) {
    const trimmed = name.trim();
    if (trimmed === (sku.name ?? "").trim()) return;

    setUpdatingId(sku.id);
    setError(null);
    try {
      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");

      const updated = data.sku as SkuRow;
      setSkus((prev) =>
        prev.map((row) => (row.id === sku.id ? { ...row, ...updated } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleActive(sku: SkuRow) {
    if (sku.is_bundle) return;
    setUpdatingId(sku.id);
    try {
      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !sku.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setSkus((prev) =>
        prev.map((row) =>
          row.id === sku.id ? { ...row, is_active: !row.is_active } : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAddSku() {
    const sku_code = addSkuCode.trim();
    if (!sku_code) return;

    setAddSaving(true);
    setError(null);
    setAddSuccess(null);
    try {
      const body: Record<string, string | boolean> = {
        sku_code,
        is_bundle: addIsBundle,
      };
      if (addSkuName.trim()) body.name = addSkuName.trim();
      if (!addIsBundle) {
        if (addFranchiseName.trim()) {
          body.franchise_name = addFranchiseName.trim();
        } else if (addFranchiseId) {
          body.franchise_id = addFranchiseId;
        }
      }

      const res = await fetch("/api/skus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add SKU");

      const created = data.sku as SkuRow;
      if (created.franchise_id || created.is_bundle) {
        setSkus((prev) =>
          [...prev, created].sort((a, b) =>
            a.sku_code.localeCompare(b.sku_code),
          ),
        );
      }

      setAddSkuCode("");
      setAddSkuName("");
      setAddFranchiseId("");
      setAddFranchiseName("");
      setAddIsBundle(false);

      if (!created.franchise_id && !created.is_bundle) {
        setAddSuccess(
          `${created.sku_code} added. Assign a franchise to include it in forecast and this list.`,
        );
      } else {
        setAddSuccess(`${created.sku_code} added.`);
        if (addFranchiseName.trim() && created.franchise_name) {
          setFranchises((prev) => {
            if (prev.some((f) => f.id === created.franchise_id)) return prev;
            return [
              ...prev,
              { id: created.franchise_id!, name: created.franchise_name! },
            ].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add SKU");
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">
          SKUs & Franchises
        </h1>
        <p className="mt-1 text-stone-600">
          Product names, franchises, and bundle flags for forecasting. Add SKUs
          manually for new products, or upload franchise and bundle mappings
          from Excel. Mark retired SKUs as inactive to keep them in historical
          sales and bundle rules without showing them in the inventory forecast.
          Set unit costs from{" "}
          <Link
            href="/dashboard/mappings/cogs"
            className="font-medium text-emerald-700 hover:text-emerald-800"
          >
            COGS
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add SKU</CardTitle>
          <CardDescription>
            Create a SKU without uploading sales or stock files. Single SKUs
            need a franchise to appear in forecast; bundle parents need a
            breakdown sheet (upload or Excel) before sales split applies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">
                SKU code
              </label>
              <Input
                placeholder="e.g. FTI-SKU-001"
                value={addSkuCode}
                onChange={(e) => setAddSkuCode(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">
                Product name
              </label>
              <Input
                placeholder="Optional — defaults to SKU code"
                value={addSkuName}
                onChange={(e) => setAddSkuName(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              className="rounded border-stone-300"
              checked={addIsBundle}
              onChange={(e) => {
                setAddIsBundle(e.target.checked);
                if (e.target.checked) {
                  setAddFranchiseId("");
                  setAddFranchiseName("");
                }
              }}
            />
            Bundle parent SKU (no franchise)
          </label>

          {!addIsBundle && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-stone-700">
                  Franchise
                </label>
                <Select
                  value={addFranchiseId}
                  onChange={(e) => {
                    setAddFranchiseId(e.target.value);
                    if (e.target.value) setAddFranchiseName("");
                  }}
                >
                  <option value="">Select existing…</option>
                  {franchises.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-stone-700">
                  Or new franchise
                </label>
                <Input
                  placeholder="Creates franchise if needed"
                  value={addFranchiseName}
                  disabled={Boolean(addFranchiseId)}
                  onChange={(e) => setAddFranchiseName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleAddSku}
              disabled={addSaving || !addSkuCode.trim()}
            >
              <Plus className="h-4 w-4" />
              {addSaving ? "Adding…" : "Add SKU"}
            </Button>
            {addSuccess && (
              <p className="text-sm text-emerald-700">{addSuccess}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SKU status</CardTitle>
          <CardDescription>
            Inactive SKUs remain in franchise and bundle mappings. Re-uploading
            the mappings Excel does not reset status. Only active, franchise-mapped
            single SKUs appear in inventory forecast. Edit product names inline;
            change a franchise from the dropdown in the table.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search SKU or franchise…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex gap-2">
              {(
                [
                  ["all", "All"],
                  ["active", "Active"],
                  ["inactive", "Inactive"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={statusFilter === id ? "default" : "outline"}
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={loadSkus}>
              Refresh
            </Button>
          </div>

          {inactiveCount > 0 && (
            <p className="text-sm text-stone-600">
              {inactiveCount} single SKU{inactiveCount === 1 ? "" : "s"} marked
              inactive (excluded from forecast).
            </p>
          )}

          {loading ? (
            <p className="text-sm text-stone-500">Loading SKUs…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-stone-500">
              No SKUs found. Add a SKU above or upload franchise and bundle
              mappings.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Product name</th>
                    <th className="px-3 py-2">Franchise</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Forecast</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sku) => (
                    <tr
                      key={sku.id}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs sm:text-sm">
                        {sku.sku_code}
                      </td>
                      <td className="px-3 py-2">
                        <ProductNameInput
                          name={sku.name}
                          disabled={updatingId === sku.id}
                          onSave={(name) => updateProductName(sku, name)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {sku.is_bundle ? (
                          "—"
                        ) : editingFranchiseId === sku.id ? (
                          <div className="flex min-w-[200px] flex-wrap items-center gap-2">
                            <Input
                              placeholder="New franchise name"
                              value={newFranchiseName}
                              onChange={(e) => setNewFranchiseName(e.target.value)}
                              className="h-8 min-w-[140px] flex-1 text-xs"
                              disabled={updatingId === sku.id}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newFranchiseName.trim()) {
                                  void updateFranchise(
                                    sku,
                                    "",
                                    newFranchiseName.trim(),
                                  );
                                }
                                if (e.key === "Escape") {
                                  setEditingFranchiseId(null);
                                  setNewFranchiseName("");
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              disabled={
                                updatingId === sku.id ||
                                !newFranchiseName.trim()
                              }
                              onClick={() =>
                                updateFranchise(
                                  sku,
                                  "",
                                  newFranchiseName.trim(),
                                )
                              }
                            >
                              {updatingId === sku.id ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updatingId === sku.id}
                              onClick={() => {
                                setEditingFranchiseId(null);
                                setNewFranchiseName("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Select
                            value={sku.franchise_id ?? ""}
                            disabled={updatingId === sku.id}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "__new__") {
                                setEditingFranchiseId(sku.id);
                                setNewFranchiseName("");
                                return;
                              }
                              void updateFranchise(sku, value);
                            }}
                            className="h-8 min-w-[160px] text-xs"
                          >
                            {franchiseOptions.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                            <option value="__new__">+ New franchise…</option>
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {sku.is_bundle ? (
                          <Badge className="bg-stone-100 text-stone-700">
                            Bundle
                          </Badge>
                        ) : (
                          <Badge className="bg-sky-100 text-sky-800">
                            Single
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {sku.is_bundle ? (
                          <span className="text-stone-500">N/A</span>
                        ) : sku.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-800">
                            Included
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800">
                            Excluded
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {sku.is_bundle ? (
                          <span className="text-xs text-stone-400">—</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === sku.id}
                            onClick={() => toggleActive(sku)}
                          >
                            {updatingId === sku.id
                              ? "Saving…"
                              : sku.is_active
                                ? "Mark inactive"
                                : "Mark active"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How aggregation works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-stone-600">
          <p>
            1. <strong>Bundle sales</strong> are split into component single
            SKUs using the bundle breakdown sheet.
          </p>
          <p>
            2. <strong>Single-SKU totals</strong> combine direct sales and
            bundle-derived units (and net sales) per component SKU.
          </p>
          <p>
            3. <strong>Franchise totals</strong> sum those single-SKU figures
            via the franchise mapping below. Bundle parent SKUs are never mapped
            to a franchise.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Franchise sheet</CardTitle>
          <CardDescription>
            Map each single (component) SKU to one product franchise. Do not
            include bundle parent SKUs here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-800">
            {franchiseColumns.join(" | ")}
          </code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bundle breakdown sheet</CardTitle>
          <CardDescription>
            Defines how bundle parent SKUs decompose into single SKUs. Net sales
            are split by each component&apos;s RSP share: (component Harga ×
            qty_per_bundle) ÷ sum of all component RSP contributions. Quantity
            still uses qty_per_bundle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-800">
            {bundleColumns.join(" | ")}
          </code>
          <p className="mt-3 text-sm text-stone-500">
            Example: selling 10× BUNDLE-A where BUNDLE-A contains 2× SKU-1 and
            1× SKU-2 credits SKU-1 with 20 units and SKU-2 with 10 units, with
            net sales split by RSP contribution (e.g. if SKU-1 RSP is 100k and
            SKU-2 is 50k with qty 2:1, split is 100k:100k → 50:50 of bundle
            net sales). Units then roll up to each SKU&apos;s franchise.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductNameInput({
  name,
  disabled,
  onSave,
}: {
  name: string | null;
  disabled: boolean;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(name ?? "");

  useEffect(() => {
    setValue(name ?? "");
  }, [name]);

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      placeholder="Product name"
      className="h-8 min-w-[160px] text-xs"
      disabled={disabled}
    />
  );
}
