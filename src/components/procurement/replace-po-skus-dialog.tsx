"use client";

import { useEffect, useMemo, useState } from "react";
import { SkuSearchInput } from "@/components/packaging/sku-search-input";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PoSkuOption } from "@/components/procurement/edit-po-dialog";
import { formatNumber } from "@/lib/utils";
import type { PurchaseOrder } from "@/types/database";

export function ReplacePoSkusDialog({
  po,
  skus: initialSkus,
  onClose,
  onSaved,
}: {
  po: PurchaseOrder;
  skus: PoSkuOption[];
  onClose: () => void;
  onSaved: (updated: PurchaseOrder) => void;
}) {
  const lines = po.lines ?? [];
  const [skus, setSkus] = useState(initialSkus);
  const skuById = useMemo(() => new Map(skus.map((sku) => [sku.id, sku])), [skus]);
  const [nextSkuByLine, setNextSkuByLine] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function refreshSkus() {
      try {
        const res = await fetch("/api/procurement/skus");
        const data = await res.json();
        if (!active || !Array.isArray(data.skus)) return;
        setSkus(data.skus);
      } catch {
        // keep the SKU list already on the page
      }
    }
    void refreshSkus();
    return () => {
      active = false;
    };
  }, []);

  const changes = useMemo(
    () =>
      lines.flatMap((line) => {
        const nextId = nextSkuByLine[line.id];
        if (!nextId || nextId === line.sku_id) return [];
        return [
          {
            line,
            new_sku_id: nextId,
          },
        ];
      }),
    [lines, nextSkuByLine, skuById],
  );

  async function handleSubmit() {
    if (changes.length === 0) {
      setFormError("Pick a different SKU for at least one line.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/procurement/pos/${po.id}/replace-skus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replacements: changes.map((change) => ({
            po_line_id: change.line.id,
            new_sku_id: change.new_sku_id,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to replace SKUs");
      onSaved(data.purchaseOrder);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to replace SKUs");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Replace SKUs on ${po.po_number}`}
      description="Swap placeholder SKUs for the official codes. This updates the PO, inbound receives, production reports, batches, and moves this PO’s received stock to the new SKU."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="space-y-3">
          {lines.map((line) => {
            const selectedId = nextSkuByLine[line.id] ?? "";
            const selected = selectedId ? (skuById.get(selectedId) ?? null) : null;
            const changed = Boolean(selectedId && selectedId !== line.sku_id);
            return (
              <div
                key={line.id}
                className="rounded-lg border border-stone-200 p-3"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium text-stone-900">
                      {line.sku_code ?? "Unknown SKU"}
                    </p>
                    {line.sku_name ? (
                      <p className="text-xs text-stone-500">{line.sku_name}</p>
                    ) : null}
                    {line.original_sku_code &&
                    line.original_sku_id !== line.sku_id ? (
                      <p className="text-xs text-stone-500">
                        Originally {line.original_sku_code}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-xs text-stone-500">
                    Ordered {formatNumber(line.qty_ordered)}
                    {line.qty_received > 0
                      ? ` · Received ${formatNumber(line.qty_received)}`
                      : ""}
                  </p>
                </div>
                <SkuSearchInput
                  options={skus.filter((sku) => sku.id !== line.sku_id)}
                  value={selected}
                  onChange={(option) =>
                    setNextSkuByLine((prev) => {
                      const next = { ...prev };
                      if (!option || option.id === line.sku_id) {
                        delete next[line.id];
                      } else {
                        next[line.id] = option.id;
                      }
                      return next;
                    })
                  }
                  placeholder="Search official SKU or name…"
                />
                {changed ? (
                  <p className="mt-1.5 text-xs text-emerald-800">
                    Will become {selected?.sku_code ?? selectedId}
                    {selected?.name ? ` · ${selected.name}` : ""}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-stone-500">
                    Leave blank to keep this line unchanged.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {changes.length > 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {changes.length} line{changes.length === 1 ? "" : "s"} will be
            remapped. If a warehouse stock upload already includes the official
            SKU, check on-hand after replacing so received qty is not counted
            twice.
          </div>
        ) : null}

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || changes.length === 0}
          >
            {saving
              ? "Replacing..."
              : `Replace ${changes.length} SKU${changes.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
