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
  is_packaging: boolean;
  is_extract: boolean;
  is_clearance: boolean;
  is_active: boolean;
  franchise_id: string | null;
  franchise_name: string | null;
  retail_price: number | null;
}

type StatusFilter = "all" | "active" | "inactive";
type ListTab = "mapped" | "unclassified";
type ProductType = "single" | "bundle" | "packaging" | "extract";

interface FranchiseOption {
  id: string;
  name: string;
}

function skuTypeLabel(
  sku: Pick<SkuRow, "is_bundle" | "is_packaging" | "is_extract">,
): string {
  if (sku.is_bundle) return "Bundle";
  if (sku.is_packaging) return "Packaging";
  if (sku.is_extract) return "Extract";
  return "Single";
}

function SkuTypeBadge({
  sku,
}: {
  sku: Pick<SkuRow, "is_bundle" | "is_packaging" | "is_extract">;
}) {
  if (sku.is_bundle) {
    return <Badge className="bg-stone-100 text-stone-700">Bundle</Badge>;
  }
  if (sku.is_packaging) {
    return <Badge className="bg-amber-100 text-amber-800">Packaging</Badge>;
  }
  if (sku.is_extract) {
    return <Badge className="bg-teal-100 text-teal-800">Extract</Badge>;
  }
  return <Badge className="bg-sky-100 text-sky-800">Single</Badge>;
}

export default function MappingsPage() {
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [unclassified, setUnclassified] = useState<SkuRow[]>([]);
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [unclassifiedLoading, setUnclassifiedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [listTab, setListTab] = useState<ListTab>("mapped");
  const [highlightSkuCode, setHighlightSkuCode] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingFranchiseId, setEditingFranchiseId] = useState<string | null>(
    null,
  );
  const [newFranchiseName, setNewFranchiseName] = useState("");
  const [classifyFranchiseId, setClassifyFranchiseId] = useState<
    Record<string, string>
  >({});
  const [addSkuCode, setAddSkuCode] = useState("");
  const [addSkuName, setAddSkuName] = useState("");
  const [addFranchiseId, setAddFranchiseId] = useState("");
  const [addFranchiseName, setAddFranchiseName] = useState("");
  const [addProductType, setAddProductType] = useState<ProductType>("single");
  const [addSkuRsp, setAddSkuRsp] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const loadMappedSkus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/skus?scope=mapped");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load SKUs");
      setSkus(data.skus ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SKUs");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUnclassified = useCallback(async () => {
    setUnclassifiedLoading(true);
    try {
      const res = await fetch("/api/skus?scope=unclassified");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load unclassified SKUs");
      }
      setUnclassified(data.skus ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load unclassified SKUs",
      );
    } finally {
      setUnclassifiedLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadMappedSkus(), loadUnclassified()]);
  }, [loadMappedSkus, loadUnclassified]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    fetch("/api/metadata")
      .then((res) => res.json())
      .then((data) => {
        if (data.franchises) setFranchises(data.franchises);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!highlightSkuCode) return;
    const timer = window.setTimeout(() => setHighlightSkuCode(null), 8000);
    return () => window.clearTimeout(timer);
  }, [highlightSkuCode]);

  const filteredMapped = useMemo(() => {
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

  const filteredUnclassified = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unclassified.filter((sku) => {
      if (!q) return true;
      return (
        sku.sku_code.toLowerCase().includes(q) ||
        (sku.name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [unclassified, search]);

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
    if (sku.is_bundle || sku.is_packaging || sku.is_extract) return;
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
      setUnclassified((prev) => prev.filter((row) => row.id !== sku.id));

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
      setUnclassified((prev) =>
        prev.map((row) => (row.id === sku.id ? { ...row, ...updated } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function updateRetailPrice(sku: SkuRow, retailPrice: number | null) {
    if (sku.retail_price === retailPrice) return;

    setUpdatingId(sku.id);
    setError(null);
    try {
      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sku.retail_price != null &&
            sku.retail_price > 0 &&
            retailPrice != null
            ? {
                retail_price: retailPrice,
                effective_from: `${new Date().getFullYear()}-${String(
                  new Date().getMonth() + 1,
                ).padStart(2, "0")}`,
              }
            : { retail_price: retailPrice },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");

      const updated = data.sku as SkuRow;
      setSkus((prev) =>
        prev.map((row) => (row.id === sku.id ? { ...row, ...updated } : row)),
      );
      setUnclassified((prev) =>
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

  async function toggleClearance(sku: SkuRow) {
    if (sku.is_bundle || sku.is_packaging || sku.is_extract) return;
    setUpdatingId(sku.id);
    setError(null);
    try {
      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_clearance: !sku.is_clearance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      const updated = data.sku as SkuRow;
      setSkus((prev) =>
        prev.map((row) =>
          row.id === sku.id
            ? { ...row, is_clearance: updated.is_clearance ?? !row.is_clearance }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  function upsertMappedSku(updated: SkuRow) {
    setSkus((prev) => {
      if (prev.some((row) => row.id === updated.id)) {
        return prev.map((row) =>
          row.id === updated.id ? { ...row, ...updated } : row,
        );
      }
      return [...prev, updated].sort((a, b) =>
        a.sku_code.localeCompare(b.sku_code),
      );
    });
  }

  /** Convert a mapped single SKU to bundle, packaging, or extract (clears franchise). */
  async function changeMappedKind(
    sku: SkuRow,
    kind: "bundle" | "packaging" | "extract",
  ) {
    if (sku.is_bundle || sku.is_packaging || sku.is_extract) return;
    setUpdatingId(sku.id);
    setError(null);
    try {
      const body =
        kind === "bundle"
          ? { is_bundle: true, is_packaging: false, is_extract: false }
          : kind === "packaging"
            ? { is_bundle: false, is_packaging: true, is_extract: false }
            : { is_bundle: false, is_packaging: false, is_extract: true };
      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      const updated = data.sku as SkuRow;
      upsertMappedSku({
        ...updated,
        franchise_id: null,
        franchise_name: null,
        is_clearance: false,
      });
      if (editingFranchiseId === sku.id) {
        setEditingFranchiseId(null);
        setNewFranchiseName("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function classifySku(
    sku: SkuRow,
    kind: ProductType,
    franchiseId?: string,
  ) {
    setUpdatingId(sku.id);
    setError(null);
    try {
      let body: Record<string, string | boolean>;
      if (kind === "bundle") {
        body = { is_bundle: true, is_packaging: false, is_extract: false };
      } else if (kind === "packaging") {
        body = { is_bundle: false, is_packaging: true, is_extract: false };
      } else if (kind === "extract") {
        body = { is_bundle: false, is_packaging: false, is_extract: true };
      } else {
        if (!franchiseId) {
          throw new Error("Select a franchise to classify as a single SKU.");
        }
        body = {
          is_bundle: false,
          is_packaging: false,
          is_extract: false,
          franchise_id: franchiseId,
        };
      }

      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Classification failed");

      const updated = data.sku as SkuRow;
      setUnclassified((prev) => prev.filter((row) => row.id !== sku.id));
      setClassifyFranchiseId((prev) => {
        const next = { ...prev };
        delete next[sku.id];
        return next;
      });

      if (
        updated.is_bundle ||
        updated.is_packaging ||
        updated.is_extract ||
        updated.franchise_id
      ) {
        upsertMappedSku(updated);
      }

      if (updated.franchise_id && updated.franchise_name) {
        setFranchises((prev) => {
          if (prev.some((f) => f.id === updated.franchise_id)) return prev;
          return [
            ...prev,
            { id: updated.franchise_id!, name: updated.franchise_name! },
          ].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setUpdatingId(null);
    }
  }

  function openUnclassifiedForCode(skuCode: string) {
    setListTab("unclassified");
    setSearch(skuCode);
    setHighlightSkuCode(skuCode);
  }

  async function handleAddSku() {
    const sku_code = addSkuCode.trim();
    if (!sku_code) return;

    setAddSaving(true);
    setError(null);
    setAddSuccess(null);
    try {
      const body: Record<string, string | boolean | number> = {
        sku_code,
        is_bundle: addProductType === "bundle",
        is_packaging: addProductType === "packaging",
        is_extract: addProductType === "extract",
      };
      if (addSkuName.trim()) body.name = addSkuName.trim();
      const rspTrim = addSkuRsp.trim().replace(/,/g, "");
      if (rspTrim) {
        const rsp = Number(rspTrim);
        if (!Number.isFinite(rsp) || rsp <= 0) {
          throw new Error("RSP must be a number greater than 0.");
        }
        body.retail_price = rsp;
      }
      if (addProductType === "single") {
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
      if (!res.ok) {
        if (res.status === 409 && data.existing) {
          const existing = data.existing as {
            sku_code: string;
            is_bundle: boolean;
            is_packaging: boolean;
            is_extract: boolean;
            franchise_id: string | null;
          };
          const isOrphan =
            !existing.is_bundle &&
            !existing.is_packaging &&
            !existing.is_extract &&
            !existing.franchise_id;
          if (isOrphan) {
            setError(
              `${existing.sku_code} already exists and needs classification.`,
            );
            openUnclassifiedForCode(existing.sku_code);
            await loadUnclassified();
          } else {
            setError(
              `${existing.sku_code} already exists as ${skuTypeLabel(existing)}.`,
            );
            if (
              existing.is_bundle ||
              existing.is_packaging ||
              existing.is_extract ||
              existing.franchise_id
            ) {
              setListTab("mapped");
              setSearch(existing.sku_code);
              setHighlightSkuCode(existing.sku_code);
            }
          }
          return;
        }
        throw new Error(data.error ?? "Failed to add SKU");
      }

      const created = data.sku as SkuRow;
      setAddSkuCode("");
      setAddSkuName("");
      setAddSkuRsp("");
      setAddFranchiseId("");
      setAddFranchiseName("");
      setAddProductType("single");

      if (created.is_packaging) {
        upsertMappedSku(created);
        setAddSuccess(
          `${created.sku_code} added as packaging.`,
        );
      } else if (created.is_extract) {
        upsertMappedSku(created);
        setAddSuccess(`${created.sku_code} added as extract.`);
      } else if (created.is_bundle || created.franchise_id) {
        upsertMappedSku(created);
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
      } else {
        setUnclassified((prev) =>
          [...prev, created].sort((a, b) =>
            a.sku_code.localeCompare(b.sku_code),
          ),
        );
        setAddSuccess(
          `${created.sku_code} added. Assign a type in Needs classification to include it in forecast.`,
        );
        setListTab("unclassified");
        setHighlightSkuCode(created.sku_code);
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
          Set each SKU as single, bundle, or packaging. Add SKUs manually for
          new products, or upload franchise and bundle mappings from Excel.
          Unmapped codes from sales/stock uploads appear under Needs
          classification. Mark retired SKUs as inactive to keep them in
          historical sales without showing them in the inventory forecast. Set
          unit costs from{" "}
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
            Create a SKU without uploading sales or stock files. Singles need a
            franchise for forecast; bundles need a BOM; packaging is managed
            under Supply Chain → Packaging. Set RSP now if this is a future
            launch with no sales yet.
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
            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">
                RSP (incl. VAT)
              </label>
              <Input
                placeholder="Optional — planned selling price"
                value={addSkuRsp}
                inputMode="decimal"
                onChange={(e) => setAddSkuRsp(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-stone-700">
              Product type
            </label>
            <Select
              value={addProductType}
              onChange={(e) => {
                const next = e.target.value as ProductType;
                setAddProductType(next);
                if (next !== "single") {
                  setAddFranchiseId("");
                  setAddFranchiseName("");
                }
              }}
              className="max-w-xs"
            >
              <option value="single">Single</option>
              <option value="bundle">Bundle</option>
              <option value="packaging">Packaging</option>
              <option value="extract">Extract</option>
            </Select>
          </div>

          {addProductType === "single" && (
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
            Mapped SKUs have a franchise or are bundle parents. Needs
            classification lists unrecognized codes (usually from uploads) that
            are not yet single, bundle, or packaging. Change mapped singles to
            bundle or packaging when needed; mark clearance when stock is being
            flushed — they stay in inventory forecast without a Reorder now
            badge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={listTab === "mapped" ? "default" : "outline"}
              onClick={() => setListTab("mapped")}
            >
              Mapped
              <span className="ml-1.5 text-xs opacity-80">({skus.length})</span>
            </Button>
            <Button
              size="sm"
              variant={listTab === "unclassified" ? "default" : "outline"}
              onClick={() => setListTab("unclassified")}
            >
              Needs classification
              {unclassified.length > 0 && (
                <Badge className="ml-1.5 bg-amber-100 text-amber-900">
                  {unclassified.length}
                </Badge>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Input
              placeholder={
                listTab === "mapped"
                  ? "Search SKU or franchise…"
                  : "Search unclassified SKU…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            {listTab === "mapped" && (
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
            )}
            <Button size="sm" variant="outline" onClick={() => void refreshAll()}>
              Refresh
            </Button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {listTab === "mapped" && inactiveCount > 0 && (
            <p className="text-sm text-stone-600">
              {inactiveCount} single SKU{inactiveCount === 1 ? "" : "s"} marked
              inactive (excluded from forecast).
            </p>
          )}

          {listTab === "mapped" ? (
            loading ? (
              <p className="text-sm text-stone-500">Loading SKUs…</p>
            ) : filteredMapped.length === 0 ? (
              <p className="text-sm text-stone-500">
                No mapped SKUs found. Add a SKU above or upload franchise and
                bundle mappings.
              </p>
            ) : (
              <MappedSkuTable
                skus={filteredMapped}
                franchiseOptions={franchiseOptions}
                updatingId={updatingId}
                editingFranchiseId={editingFranchiseId}
                newFranchiseName={newFranchiseName}
                highlightSkuCode={highlightSkuCode}
                onEditFranchise={(id) => {
                  setEditingFranchiseId(id);
                  setNewFranchiseName("");
                }}
                onCancelEditFranchise={() => {
                  setEditingFranchiseId(null);
                  setNewFranchiseName("");
                }}
                onNewFranchiseNameChange={setNewFranchiseName}
                onUpdateFranchise={updateFranchise}
                onUpdateProductName={updateProductName}
                onUpdateRetailPrice={updateRetailPrice}
                onToggleActive={toggleActive}
                onToggleClearance={toggleClearance}
                onChangeKind={changeMappedKind}
              />
            )
          ) : unclassifiedLoading ? (
            <p className="text-sm text-stone-500">
              Loading unclassified SKUs…
            </p>
          ) : filteredUnclassified.length === 0 ? (
            <p className="text-sm text-stone-500">
              No unclassified SKUs. New codes from sales/stock uploads will
              appear here until you set them as single, bundle, or packaging.
            </p>
          ) : (
            <UnclassifiedSkuTable
              skus={filteredUnclassified}
              franchises={franchises}
              classifyFranchiseId={classifyFranchiseId}
              updatingId={updatingId}
              highlightSkuCode={highlightSkuCode}
              onClassifyFranchiseChange={(id, franchiseId) =>
                setClassifyFranchiseId((prev) => ({
                  ...prev,
                  [id]: franchiseId,
                }))
              }
              onUpdateProductName={updateProductName}
              onClassify={classifySku}
            />
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

function MappedSkuTable({
  skus,
  franchiseOptions,
  updatingId,
  editingFranchiseId,
  newFranchiseName,
  highlightSkuCode,
  onEditFranchise,
  onCancelEditFranchise,
  onNewFranchiseNameChange,
  onUpdateFranchise,
  onUpdateProductName,
  onUpdateRetailPrice,
  onToggleActive,
  onToggleClearance,
  onChangeKind,
}: {
  skus: SkuRow[];
  franchiseOptions: FranchiseOption[];
  updatingId: string | null;
  editingFranchiseId: string | null;
  newFranchiseName: string;
  highlightSkuCode: string | null;
  onEditFranchise: (id: string) => void;
  onCancelEditFranchise: () => void;
  onNewFranchiseNameChange: (value: string) => void;
  onUpdateFranchise: (
    sku: SkuRow,
    franchiseId: string,
    franchiseName?: string,
  ) => void;
  onUpdateProductName: (sku: SkuRow, name: string) => void;
  onUpdateRetailPrice: (sku: SkuRow, retailPrice: number | null) => void;
  onToggleActive: (sku: SkuRow) => void;
  onToggleClearance: (sku: SkuRow) => void;
  onChangeKind: (sku: SkuRow, kind: "bundle" | "packaging" | "extract") => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Product name</th>
            <th className="px-3 py-2">RSP</th>
            <th className="px-3 py-2">Franchise</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Forecast</th>
            <th className="px-3 py-2">Clearance</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((sku) => (
            <tr
              key={sku.id}
              className={
                highlightSkuCode === sku.sku_code
                  ? "border-b border-amber-200 bg-amber-50 last:border-0"
                  : "border-b border-stone-100 last:border-0"
              }
            >
              <td className="px-3 py-2 font-mono text-xs sm:text-sm">
                {sku.sku_code}
              </td>
              <td className="px-3 py-2">
                <ProductNameInput
                  name={sku.name}
                  disabled={updatingId === sku.id}
                  onSave={(name) => onUpdateProductName(sku, name)}
                />
              </td>
              <td className="px-3 py-2">
                <RetailPriceInput
                  retailPrice={sku.retail_price}
                  disabled={updatingId === sku.id}
                  onSave={(retailPrice) =>
                    onUpdateRetailPrice(sku, retailPrice)
                  }
                />
              </td>
              <td className="px-3 py-2">
                {sku.is_bundle || sku.is_packaging || sku.is_extract ? (
                  "—"
                ) : editingFranchiseId === sku.id ? (
                  <div className="flex min-w-[200px] flex-wrap items-center gap-2">
                    <Input
                      placeholder="New franchise name"
                      value={newFranchiseName}
                      onChange={(e) => onNewFranchiseNameChange(e.target.value)}
                      className="h-8 min-w-[140px] flex-1 text-xs"
                      disabled={updatingId === sku.id}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newFranchiseName.trim()) {
                          void onUpdateFranchise(
                            sku,
                            "",
                            newFranchiseName.trim(),
                          );
                        }
                        if (e.key === "Escape") {
                          onCancelEditFranchise();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={
                        updatingId === sku.id || !newFranchiseName.trim()
                      }
                      onClick={() =>
                        onUpdateFranchise(sku, "", newFranchiseName.trim())
                      }
                    >
                      {updatingId === sku.id ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updatingId === sku.id}
                      onClick={onCancelEditFranchise}
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
                        onEditFranchise(sku.id);
                        return;
                      }
                      void onUpdateFranchise(sku, value);
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
                <SkuTypeBadge sku={sku} />
              </td>
              <td className="px-3 py-2">
                {sku.is_bundle || sku.is_packaging || sku.is_extract ? (
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
                {sku.is_bundle || sku.is_packaging || sku.is_extract ? (
                  <span className="text-xs text-stone-400">—</span>
                ) : sku.is_clearance ? (
                  <Badge className="bg-violet-100 text-violet-800">
                    Clearance
                  </Badge>
                ) : (
                  <span className="text-xs text-stone-400">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                {sku.is_bundle || sku.is_packaging || sku.is_extract ? (
                  <span className="text-xs text-stone-400">—</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === sku.id}
                      onClick={() => onChangeKind(sku, "bundle")}
                    >
                      {updatingId === sku.id ? "Saving…" : "Change to bundle"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === sku.id}
                      onClick={() => onChangeKind(sku, "packaging")}
                    >
                      {updatingId === sku.id
                        ? "Saving…"
                        : "Change to packaging"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === sku.id}
                      onClick={() => onChangeKind(sku, "extract")}
                    >
                      {updatingId === sku.id
                        ? "Saving…"
                        : "Change to extract"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === sku.id}
                      onClick={() => onToggleClearance(sku)}
                    >
                      {updatingId === sku.id
                        ? "Saving…"
                        : sku.is_clearance
                          ? "Unmark clearance"
                          : "Mark clearance"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === sku.id}
                      onClick={() => onToggleActive(sku)}
                    >
                      {updatingId === sku.id
                        ? "Saving…"
                        : sku.is_active
                          ? "Mark inactive"
                          : "Mark active"}
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnclassifiedSkuTable({
  skus,
  franchises,
  classifyFranchiseId,
  updatingId,
  highlightSkuCode,
  onClassifyFranchiseChange,
  onUpdateProductName,
  onClassify,
}: {
  skus: SkuRow[];
  franchises: FranchiseOption[];
  classifyFranchiseId: Record<string, string>;
  updatingId: string | null;
  highlightSkuCode: string | null;
  onClassifyFranchiseChange: (id: string, franchiseId: string) => void;
  onUpdateProductName: (sku: SkuRow, name: string) => void;
  onClassify: (
    sku: SkuRow,
    kind: ProductType,
    franchiseId?: string,
  ) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Product name</th>
            <th className="px-3 py-2">Classify</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((sku) => {
            const franchiseId = classifyFranchiseId[sku.id] ?? "";
            const busy = updatingId === sku.id;
            return (
              <tr
                key={sku.id}
                className={
                  highlightSkuCode === sku.sku_code
                    ? "border-b border-amber-200 bg-amber-50 last:border-0"
                    : "border-b border-stone-100 last:border-0"
                }
              >
                <td className="px-3 py-2 font-mono text-xs sm:text-sm">
                  {sku.sku_code}
                </td>
                <td className="px-3 py-2">
                  <ProductNameInput
                    name={sku.name}
                    disabled={busy}
                    onSave={(name) => onUpdateProductName(sku, name)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-[280px] flex-wrap items-center gap-2">
                    <Select
                      value={franchiseId}
                      disabled={busy}
                      onChange={(e) =>
                        onClassifyFranchiseChange(sku.id, e.target.value)
                      }
                      className="h-8 min-w-[140px] text-xs"
                    >
                      <option value="">Franchise for single…</option>
                      {franchises.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      disabled={busy || !franchiseId}
                      onClick={() => onClassify(sku, "single", franchiseId)}
                    >
                      {busy ? "Saving…" : "Single"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onClassify(sku, "bundle")}
                    >
                      Bundle
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onClassify(sku, "packaging")}
                    >
                      Packaging
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onClassify(sku, "extract")}
                    >
                      Extract
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

function RetailPriceInput({
  retailPrice,
  disabled,
  onSave,
}: {
  retailPrice: number | null;
  disabled: boolean;
  onSave: (retailPrice: number | null) => void;
}) {
  const [value, setValue] = useState(
    retailPrice != null ? String(retailPrice) : "",
  );

  useEffect(() => {
    setValue(retailPrice != null ? String(retailPrice) : "");
  }, [retailPrice]);

  function commit() {
    const trimmed = value.trim().replace(/,/g, "");
    if (trimmed === "") {
      onSave(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      setValue(retailPrice != null ? String(retailPrice) : "");
      return;
    }
    onSave(n);
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      placeholder="—"
      inputMode="decimal"
      title="Retail selling price (incl. VAT)"
      className="h-8 min-w-[7rem] text-xs"
      disabled={disabled}
    />
  );
}
