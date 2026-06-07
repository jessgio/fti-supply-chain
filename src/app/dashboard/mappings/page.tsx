"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  franchise_name: string | null;
}

type StatusFilter = "all" | "active" | "inactive";

export default function MappingsPage() {
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">SKU mappings</h1>
        <p className="mt-1 text-stone-600">
          Product franchises are built from single SKUs only. Mark retired SKUs
          as inactive to keep them in historical sales and bundle rules without
          showing them in the inventory forecast.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SKU status</CardTitle>
          <CardDescription>
            Inactive SKUs remain in franchise and bundle mappings. Re-uploading
            the mappings Excel does not reset status. Only active, franchise-mapped
            single SKUs appear in inventory forecast.
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
              No SKUs found. Upload franchise and bundle mappings first.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">SKU</th>
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
                        {sku.franchise_name ?? "—"}
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
