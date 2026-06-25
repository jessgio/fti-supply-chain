"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { SkuSearchInput } from "@/components/packaging/sku-search-input";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PO_CURRENCY,
  PO_CURRENCIES,
} from "@/lib/procurement/currencies";
import { DEFAULT_PO_TAX_PCT } from "@/lib/procurement/po-totals";
import type { PoStatus, PurchaseOrder, Supplier } from "@/types/database";

export interface PoSkuOption {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle?: boolean;
  franchise_name?: string | null;
}

interface DraftLine {
  id?: string;
  sku_id: string;
  qty_ordered: string;
  unit_cost: string;
  qty_received?: number;
  is_closed?: boolean;
}

const STATUS_LABELS: Record<PoStatus, string> = {
  planned: "Planned",
  ordered: "Ordered",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

const STATUS_FLOW: PoStatus[] = ["planned", "ordered", "in_transit", "received"];

export function EditPoDialog({
  po,
  suppliers,
  skus,
  onClose,
  onSaved,
  onSupplierCreated,
}: {
  po: PurchaseOrder;
  suppliers: Supplier[];
  skus: PoSkuOption[];
  onClose: () => void;
  onSaved: (updated: PurchaseOrder) => void;
  onSupplierCreated: (s: Supplier) => void;
}) {
  const locked = po.status === "received" || po.status === "cancelled";
  const [supplierId, setSupplierId] = useState(po.supplier_id ?? "");
  const [poNumber, setPoNumber] = useState(po.po_number);
  const [status, setStatus] = useState<PoStatus>(po.status);
  const [orderDate, setOrderDate] = useState(po.order_date ?? "");
  const [expectedDate, setExpectedDate] = useState(po.expected_date ?? "");
  const [downPaymentPct, setDownPaymentPct] = useState(
    String(po.down_payment_pct ?? 30),
  );
  const [discountAmount, setDiscountAmount] = useState(
    po.discount_amount ? String(po.discount_amount) : "",
  );
  const [taxPct, setTaxPct] = useState(String(po.tax_pct ?? DEFAULT_PO_TAX_PCT));
  const [pphPct, setPphPct] = useState(String(po.pph_pct ?? 0));
  const [otherCharges, setOtherCharges] = useState(
    po.other_charges ? String(po.other_charges) : "",
  );
  const [currency, setCurrency] = useState(po.currency ?? DEFAULT_PO_CURRENCY);
  const [notes, setNotes] = useState(po.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    (po.lines ?? []).map((l) => ({
      id: l.id,
      sku_id: l.sku_id,
      qty_ordered: String(l.qty_ordered),
      unit_cost: l.unit_cost != null ? String(l.unit_cost) : "",
      qty_received: l.qty_received,
      is_closed: l.is_closed,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { sku_id: "", qty_ordered: "", unit_cost: "" },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleAddSupplier() {
    if (!newSupplier.trim()) return;
    setAddingSupplier(true);
    try {
      const res = await fetch("/api/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSupplier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onSupplierCreated(data.supplier);
      setSupplierId(data.supplier.id);
      setNewSupplier("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setAddingSupplier(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {};

      if (locked) {
        payload.notes = notes || null;
      } else {
        const cleanLines = lines
          .filter((l) => l.sku_id && Number(l.qty_ordered) > 0)
          .map((l) => ({
            id: l.id,
            sku_id: l.sku_id,
            qty_ordered: Number(l.qty_ordered),
            unit_cost: l.unit_cost ? Number(l.unit_cost) : null,
          }));

        if (cleanLines.length === 0) {
          setFormError("Add at least one line with a SKU and quantity.");
          setSaving(false);
          return;
        }

        if (!poNumber.trim()) {
          setFormError("PO number is required.");
          setSaving(false);
          return;
        }

        payload.po_number = poNumber.trim();
        payload.supplier_id = supplierId || null;
        payload.status = status;
        payload.order_date = orderDate || null;
        payload.expected_date = expectedDate || null;
        payload.down_payment_pct = downPaymentPct ? Number(downPaymentPct) : 30;
        payload.discount_amount = discountAmount ? Number(discountAmount) : 0;
        payload.tax_pct = taxPct !== "" ? Number(taxPct) : DEFAULT_PO_TAX_PCT;
        payload.pph_pct = pphPct !== "" ? Number(pphPct) : 0;
        payload.other_charges = otherCharges ? Number(otherCharges) : 0;
        payload.currency = currency;
        payload.notes = notes || null;
        payload.lines = cleanLines;
      }

      const res = await fetch(`/api/procurement/pos/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update PO");
      onSaved(data.purchaseOrder);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update PO");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${po.po_number}`}
      description={
        locked
          ? "Only notes can be changed on received or cancelled orders."
          : "Update supplier, dates, status, and line items."
      }
    >
      <div className="space-y-4">
        {!locked && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-stone-700">PO number</span>
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="PO FTI-47-29052026"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">Supplier</span>
                <Select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">No supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">Status</span>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PoStatus)}
                >
                  {STATUS_FLOW.concat("cancelled").map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex-1 space-y-1">
                <span className="text-sm font-medium text-stone-700">
                  Add a new supplier
                </span>
                <Input
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  placeholder="Supplier name"
                />
              </label>
              <Button
                variant="outline"
                onClick={handleAddSupplier}
                disabled={!newSupplier.trim() || addingSupplier}
              >
                {addingSupplier ? "Adding..." : "Add"}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">Order date</span>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">
                  Expected delivery
                </span>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">Currency</span>
                <Select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {PO_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">
                  Down payment %
                </span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={downPaymentPct}
                  onChange={(e) => setDownPaymentPct(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">
                  Vendor discount
                </span>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">VAT %</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">PPh %</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={pphPct}
                  onChange={(e) => setPphPct(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">Other</span>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-700">Line items</span>
                <Button size="sm" variant="ghost" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" />
                  Add line
                </Button>
              </div>
              {lines.map((line, idx) => {
                const received = line.qty_received ?? 0;
                const lockedLine = received > 0 || Boolean(line.is_closed);
                return (
                  <div key={line.id ?? `new-${idx}`} className="flex gap-2">
                    {lockedLine ? (
                      <Input
                        className="flex-1"
                        value={
                          skus.find((s) => s.id === line.sku_id)?.sku_code ??
                          line.sku_id
                        }
                        disabled
                      />
                    ) : (
                      <SkuSearchInput
                        className="flex-1"
                        options={skus}
                        value={skus.find((s) => s.id === line.sku_id) ?? null}
                        onChange={(option) =>
                          updateLine(idx, { sku_id: option?.id ?? "" })
                        }
                        placeholder="Search SKU or name…"
                      />
                    )}
                    <Input
                      className="w-24"
                      type="number"
                      min={lockedLine ? received : 0}
                      placeholder="Qty"
                      value={line.qty_ordered}
                      onChange={(e) =>
                        updateLine(idx, { qty_ordered: e.target.value })
                      }
                    />
                    <Input
                      className="w-28"
                      type="number"
                      min="0"
                      placeholder="Unit cost"
                      value={line.unit_cost}
                      onChange={(e) =>
                        updateLine(idx, { unit_cost: e.target.value })
                      }
                    />
                    {!lockedLine && lines.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLine(idx)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-stone-700">Notes</span>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </label>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
