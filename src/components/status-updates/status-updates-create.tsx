"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConnectedRecordsPicker } from "@/components/status-updates/connected-records-picker";
import { MentionInput } from "@/components/status-updates/mention-input";
import {
  PoProductScopePicker,
  type PoProductScopeMode,
} from "@/components/status-updates/po-product-scope-picker";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { extractMentionIds } from "@/lib/status-updates/utils";
import type {
  Profile,
  StatusUpdatePoProduct,
  StatusUpdateRelatedEntity,
} from "@/types/database";

interface SkuOption {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_name: string | null;
}

export function StatusUpdatesCreate() {
  const router = useRouter();
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [relatedEntities, setRelatedEntities] = useState<
    StatusUpdateRelatedEntity[]
  >([]);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const debouncedSkuSearch = useDebouncedValue(skuSearch);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [selectedConnectedKeys, setSelectedConnectedKeys] = useState<string[]>(
    [],
  );
  const [poProducts, setPoProducts] = useState<StatusUpdatePoProduct[]>([]);
  const [productScopeMode, setProductScopeMode] =
    useState<PoProductScopeMode>("selected");
  const [selectedScopedSkuIds, setSelectedScopedSkuIds] = useState<string[]>(
    [],
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === selectedSkuId) ?? null,
    [skus, selectedSkuId],
  );

  const filteredSkus = useMemo(() => {
    const query = debouncedSkuSearch.trim().toLowerCase();
    if (!query) return skus.slice(0, 100);
    return skus
      .filter((sku) => {
        const haystack = [
          sku.sku_code,
          sku.name ?? "",
          sku.franchise_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 100);
  }, [skus, debouncedSkuSearch]);

  const poEntities = useMemo(
    () => relatedEntities.filter((entity) => entity.entity_type === "po"),
    [relatedEntities],
  );

  const connectedForPo = useMemo(() => {
    if (!selectedPoId) return [];
    return relatedEntities.filter(
      (entity) =>
        entity.entity_type !== "po" && entity.po_id === selectedPoId,
    );
  }, [relatedEntities, selectedPoId]);

  const mentionRecords = useMemo(
    () =>
      relatedEntities.filter((entity) =>
        ["po", "payment", "shipment"].includes(entity.entity_type),
      ),
    [relatedEntities],
  );

  const loadRelatedEntities = useCallback(async (skuId: string) => {
    const res = await fetch(
      `/api/status-updates/related-entities?sku_id=${skuId}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load related entities");
    setRelatedEntities(data.entities ?? []);
  }, []);

  const loadPoProducts = useCallback(async (poId: string) => {
    const res = await fetch(`/api/status-updates/po-products?po_id=${poId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load PO products");
    return (data.products ?? []) as StatusUpdatePoProduct[];
  }, []);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const [skuRes, profileRes] = await Promise.all([
          fetch("/api/procurement/skus"),
          fetch("/api/product-development/profiles"),
        ]);
        const skuData = await skuRes.json();
        const profileData = await profileRes.json();
        if (!skuRes.ok) throw new Error(skuData.error ?? "Failed to load SKUs");
        if (!profileRes.ok) {
          throw new Error(profileData.error ?? "Failed to load profiles");
        }
        setSkus(skuData.skus ?? []);
        setProfiles(profileData.profiles ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load page");
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedSkuId) {
      setRelatedEntities([]);
      setSelectedPoId("");
      setSelectedConnectedKeys([]);
      setPoProducts([]);
      setSelectedScopedSkuIds([]);
      return;
    }

    async function loadSkuData() {
      setError(null);
      try {
        await loadRelatedEntities(selectedSkuId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load SKU data");
      }
    }
    void loadSkuData();
  }, [selectedSkuId, loadRelatedEntities]);

  useEffect(() => {
    if (!selectedPoId) {
      setPoProducts([]);
      setSelectedScopedSkuIds([]);
      return;
    }

    async function loadProducts() {
      try {
        const products = await loadPoProducts(selectedPoId);
        setPoProducts(products);
        if (products.length > 1) {
          setProductScopeMode("all");
          setSelectedScopedSkuIds([]);
        } else {
          setProductScopeMode("selected");
          setSelectedScopedSkuIds([]);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load PO products",
        );
      }
    }
    void loadProducts();
  }, [selectedPoId, loadPoProducts, selectedSkuId]);

  function toggleConnectedKey(key: string) {
    setSelectedConnectedKeys((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  }

  function toggleScopedSkuId(skuId: string) {
    setSelectedScopedSkuIds((current) =>
      current.includes(skuId)
        ? current.filter((value) => value !== skuId)
        : [...current, skuId],
    );
  }

  function selectSku(skuId: string) {
    setSelectedSkuId(skuId);
    setSelectedPoId("");
    setSelectedConnectedKeys([]);
    setPoProducts([]);
    setSelectedScopedSkuIds([]);
    setNoteDraft("");
  }

  async function postUpdate() {
    if (!selectedSkuId || !selectedPoId || !noteDraft.trim() || posting) {
      return;
    }

    const allProductIds = poProducts.map((product) => product.sku_id);
    const selectedAllProducts =
      poProducts.length <= 1 ||
      productScopeMode === "all" ||
      (productScopeMode === "selected" &&
        selectedScopedSkuIds.length === poProducts.length &&
        allProductIds.every((id) => selectedScopedSkuIds.includes(id)));
    const appliesToAll = poProducts.length > 1 && selectedAllProducts;
    if (
      poProducts.length > 1 &&
      !selectedAllProducts &&
      selectedScopedSkuIds.length === 0
    ) {
      setError("Select at least one product this note applies to.");
      return;
    }

    const connected_refs = selectedConnectedKeys.map((key) => {
      const [entityType, entityId] = key.split(":");
      return { entity_type: entityType, entity_id: entityId };
    });
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/status-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: selectedSkuId,
          po_id: selectedPoId,
          connected_refs,
          applies_to_all_po_products: appliesToAll,
          scoped_sku_ids:
            poProducts.length > 1 && !appliesToAll
              ? selectedScopedSkuIds
              : undefined,
          body: noteDraft.trim(),
          mentioned_user_ids: extractMentionIds(noteDraft),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post update");
      router.push("/dashboard/status-updates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post update");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Product</CardTitle>
            <CardDescription>
              Choose the SKU this status update is for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Search SKU or product name…"
                className="pl-9"
              />
            </div>
            <div className="max-h-[28rem] space-y-1 overflow-y-auto">
              {filteredSkus.map((sku) => (
                <button
                  key={sku.id}
                  type="button"
                  onClick={() => selectSku(sku.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    selectedSkuId === sku.id
                      ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                      : "hover:bg-stone-50 text-stone-800"
                  }`}
                >
                  <p className="font-medium">{sku.sku_code}</p>
                  <p className="truncate text-xs text-stone-500">
                    {sku.name ?? "Unnamed product"}
                    {sku.franchise_name ? ` · ${sku.franchise_name}` : ""}
                  </p>
                </button>
              ))}
              {!loading && filteredSkus.length === 0 && (
                <p className="px-2 py-4 text-sm text-stone-500">
                  No products match your search.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedSku
                ? `${selectedSku.sku_code}${selectedSku.name ? ` · ${selectedSku.name}` : ""}`
                : "New status update"}
            </CardTitle>
            <CardDescription>
              {selectedSku
                ? (selectedSku.franchise_name ??
                  "Link to a PO and add your note.")
                : "Select a product to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedSku ? (
              <p className="py-8 text-center text-sm text-stone-500">
                Pick a product from the list to create a status update.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">
                    Purchase order
                  </label>
                  <Select
                    value={selectedPoId}
                    onChange={(e) => {
                      setSelectedPoId(e.target.value);
                      setSelectedConnectedKeys([]);
                      setProductScopeMode("all");
                      setSelectedScopedSkuIds([]);
                    }}
                  >
                    <option value="">Select a PO for this product…</option>
                    {poEntities.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.label}
                        {po.status ? ` (${po.status.replace(/_/g, " ")})` : ""}
                      </option>
                    ))}
                  </Select>
                  {poEntities.length === 0 && (
                    <p className="text-xs text-stone-500">
                      No purchase orders found for this SKU yet.
                    </p>
                  )}
                </div>

                <PoProductScopePicker
                  products={poProducts}
                  mode={productScopeMode}
                  onModeChange={setProductScopeMode}
                  selectedSkuIds={selectedScopedSkuIds}
                  onToggleSku={toggleScopedSkuId}
                  currentSkuId={selectedSkuId}
                  disabled={!selectedPoId}
                />

                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">
                    Connected records{" "}
                    <span className="font-normal text-stone-500">
                      (optional — select all that apply)
                    </span>
                  </label>
                  <ConnectedRecordsPicker
                    entities={connectedForPo}
                    selectedKeys={selectedConnectedKeys}
                    onToggle={toggleConnectedKey}
                    disabled={!selectedPoId}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">
                    Status update
                  </label>
                  <MentionInput
                    value={noteDraft}
                    onChange={setNoteDraft}
                    profiles={profiles}
                    recordEntities={mentionRecords}
                    placeholder="Describe the current status… use @ for people, POs, shipments, or payments"
                    multiline
                    onSubmit={postUpdate}
                    submitLabel="Post update"
                    submitting={posting}
                    disabled={!selectedPoId}
                  />
                </div>

                <p className="text-xs text-stone-500">
                  After posting, you&apos;ll return to{" "}
                  <Link
                    href="/dashboard/status-updates"
                    className="text-emerald-700 hover:underline"
                  >
                    All updates
                  </Link>
                  .
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
