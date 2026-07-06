"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConnectedRecordsPicker } from "@/components/status-updates/connected-records-picker";
import {
  LinkedPoPicker,
  type LinkedPoOption,
} from "@/components/status-updates/linked-po-picker";
import { MentionInput } from "@/components/status-updates/mention-input";
import {
  PoProductScopePicker,
  type PoProductScopeMode,
} from "@/components/status-updates/po-product-scope-picker";
import { extractMentionIds } from "@/lib/status-updates/utils";
import type {
  Profile,
  StatusUpdate,
  StatusUpdatePoProduct,
  StatusUpdateRelatedEntity,
} from "@/types/database";

interface StatusUpdateEditDialogProps {
  update: StatusUpdate;
  profiles: Profile[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function StatusUpdateEditDialog({
  update,
  profiles,
  open,
  onClose,
  onSaved,
}: StatusUpdateEditDialogProps) {
  const isPoUpdate = update.entity_type === "po";
  const poId = isPoUpdate ? update.entity_id : null;

  const [body, setBody] = useState(update.body);
  const [connectedKeys, setConnectedKeys] = useState<string[]>([]);
  const [linkedPos, setLinkedPos] = useState<LinkedPoOption[]>([]);
  const [relatedEntities, setRelatedEntities] = useState<
    StatusUpdateRelatedEntity[]
  >([]);
  const [poProducts, setPoProducts] = useState<StatusUpdatePoProduct[]>([]);
  const [productScopeMode, setProductScopeMode] =
    useState<PoProductScopeMode>("selected");
  const [selectedScopedSkuIds, setSelectedScopedSkuIds] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedForPo = useMemo(() => {
    if (!poId) return [];
    return relatedEntities.filter(
      (entity) =>
        entity.entity_type !== "po" && entity.po_id === poId,
    );
  }, [relatedEntities, poId]);

  const mentionRecords = useMemo(() => {
    const base = relatedEntities.filter((entity) =>
      ["po", "payment", "shipment"].includes(entity.entity_type),
    );
    const seenPoIds = new Set(
      base.filter((entity) => entity.entity_type === "po").map((entity) => entity.id),
    );
    const linkedEntities = linkedPos
      .filter((po) => !seenPoIds.has(po.id))
      .map((po) => ({
        id: po.id,
        entity_type: "po" as const,
        label: po.po_number,
        sublabel: po.supplier_name ?? "Linked PO",
        status: po.status ?? null,
        date: null,
      }));
    return [...base, ...linkedEntities];
  }, [relatedEntities, linkedPos]);

  useEffect(() => {
    if (!open) return;

    setBody(update.body);
    setLinkedPos(
      (update.connected_refs ?? [])
        .filter((ref) => ref.entity_type === "po")
        .map((ref) => ({
          id: ref.entity_id,
          po_number: ref.entity_label ?? ref.entity_id,
        })),
    );
    setConnectedKeys(
      (update.connected_refs ?? [])
        .filter((ref) => ref.entity_type !== "po")
        .map((ref) => `${ref.entity_type}:${ref.entity_id}`),
    );
    setProductScopeMode(
      update.applies_to_all_po_products ? "all" : "selected",
    );
    setSelectedScopedSkuIds(
      (update.scoped_skus ?? []).map((sku) => sku.sku_id),
    );
    setError(null);

    if (!isPoUpdate || !poId) return;

    async function loadFormData() {
      setLoading(true);
      try {
        const [entitiesRes, productsRes] = await Promise.all([
          fetch(
            `/api/status-updates/related-entities?sku_id=${update.sku_id}`,
          ),
          fetch(`/api/status-updates/po-products?po_id=${poId}`),
        ]);
        const entitiesData = await entitiesRes.json();
        const productsData = await productsRes.json();
        if (!entitiesRes.ok) {
          throw new Error(entitiesData.error ?? "Failed to load related records");
        }
        if (!productsRes.ok) {
          throw new Error(productsData.error ?? "Failed to load PO products");
        }
        setRelatedEntities(entitiesData.entities ?? []);
        setPoProducts(productsData.products ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load edit form");
      } finally {
        setLoading(false);
      }
    }

    void loadFormData();
  }, [open, update, isPoUpdate, poId]);

  function toggleConnectedKey(key: string) {
    setConnectedKeys((current) =>
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

  async function save() {
    if (!body.trim() || saving) return;

    if (
      isPoUpdate &&
      poProducts.length > 1 &&
      productScopeMode === "selected" &&
      selectedScopedSkuIds.length === 0
    ) {
      setError("Select at least one product this note applies to.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const connected_refs = [
        ...connectedKeys.map((key) => {
          const [entityType, entityId] = key.split(":");
          return { entity_type: entityType, entity_id: entityId };
        }),
        ...linkedPos.map((po) => ({
          entity_type: "po",
          entity_id: po.id,
        })),
      ];

      const payload: Record<string, unknown> = {
        body: body.trim(),
        mentioned_user_ids: extractMentionIds(body),
      };

      if (isPoUpdate) {
        payload.connected_refs = connected_refs;
        payload.applies_to_all_po_products =
          poProducts.length > 1 && productScopeMode === "all";
        if (poProducts.length > 1 && productScopeMode === "selected") {
          payload.scoped_sku_ids = selectedScopedSkuIds;
        } else if (poProducts.length > 1 && productScopeMode === "all") {
          payload.scoped_sku_ids = [];
        }
      }

      const res = await fetch(`/api/status-updates/${update.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save update");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit status update"
      description="Update the note, connected records, or product scope."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : (
          <>
            {isPoUpdate && (
              <>
                <PoProductScopePicker
                  products={poProducts}
                  mode={productScopeMode}
                  onModeChange={setProductScopeMode}
                  selectedSkuIds={selectedScopedSkuIds}
                  onToggleSku={toggleScopedSkuId}
                  currentSkuId={update.sku_id}
                />

                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">
                    Linked POs
                  </label>
                  <LinkedPoPicker
                    primaryPoId={poId ?? ""}
                    selected={linkedPos}
                    onChange={setLinkedPos}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">
                    Connected records
                  </label>
                  <ConnectedRecordsPicker
                    entities={connectedForPo}
                    selectedKeys={connectedKeys}
                    onToggle={toggleConnectedKey}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Status update
              </label>
              <MentionInput
                value={body}
                onChange={setBody}
                profiles={profiles}
                recordEntities={mentionRecords}
                poSearchExcludeId={poId ?? undefined}
                placeholder="Describe the current status… use @ for people, POs, shipments, or payments"
                multiline
                disabled={saving || loading}
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || loading || !body.trim()}
          >
            Save changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
