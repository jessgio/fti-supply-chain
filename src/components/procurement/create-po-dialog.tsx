"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { SkuSearchInput } from "@/components/packaging/sku-search-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PoSkuOption } from "@/components/procurement/edit-po-dialog";
import {
  formatUnitCostInput,
  LastPurchaseCostSuggestion,
  useLastPurchaseCosts,
} from "@/components/procurement/last-purchase-cost-hint";
import {
  SupplierUsualPctHint,
  useSupplierUsualTerms,
} from "@/components/procurement/supplier-usual-terms-hint";
import { formatPctInput } from "@/lib/procurement/supplier-usual-terms";
import {
  DEFAULT_PO_CURRENCY,
  formatPoMoney,
  PO_CURRENCIES,
  PO_UNIT_COST_STEP,
} from "@/lib/procurement/currencies";
import {
  computePoInvoiceTotals,
  DEFAULT_PO_TAX_PCT,
  pphLabel,
  taxLabel,
  type PoInvoiceTotals,
} from "@/lib/procurement/po-totals";
import { STATUS_FLOW, STATUS_LABELS } from "@/lib/procurement/po-status";
import type { PoStatus, PurchaseOrder, Supplier } from "@/types/database";

type SkuOption = PoSkuOption;

function PoInvoiceTotalsView({
  totals,
  fmt,
  className = "text-sm text-stone-600",
  rowClassName = "flex justify-between",
  totalRowClassName = "mt-1 flex justify-between font-medium text-stone-900",
}: {
  totals: PoInvoiceTotals;
  fmt: (value: number) => string;
  className?: string;
  rowClassName?: string;
  totalRowClassName?: string;
}) {
  return (
    <div className={className}>
      <div className={rowClassName}>
        <span>Subtotal</span>
        <span>{fmt(totals.subtotal)}</span>
      </div>
      {totals.discount > 0 && (
        <div className={`${rowClassName} mt-1`}>
          <span>Discount</span>
          <span>-{fmt(totals.discount)}</span>
        </div>
      )}
      {totals.tax > 0 && (
        <div className={`${rowClassName} mt-1`}>
          <span>{taxLabel(totals.taxPct)}</span>
          <span>{fmt(totals.tax)}</span>
        </div>
      )}
      {totals.pph > 0 && (
        <div className={`${rowClassName} mt-1`}>
          <span>{pphLabel(totals.pphPct)}</span>
          <span>-{fmt(totals.pph)}</span>
        </div>
      )}
      {totals.otherCharges > 0 && (
        <div className={`${rowClassName} mt-1`}>
          <span>Other</span>
          <span>{fmt(totals.otherCharges)}</span>
        </div>
      )}
      <div className={totalRowClassName}>
        <span>Invoice total</span>
        <span>{fmt(totals.invoiceTotal)}</span>
      </div>
      <div className={`${rowClassName} mt-1`}>
        <span>Down payment ({totals.downPaymentPct}%)</span>
        <span>{fmt(totals.downPayment)}</span>
      </div>
      <div className={`${rowClassName} mt-1`}>
        <span>Final payment ({100 - totals.downPaymentPct}%)</span>
        <span>{fmt(totals.finalPayment)}</span>
      </div>
    </div>
  );
}


interface DraftLine {
  id?: string;
  sku_id: string;
  qty_ordered: string;
  unit_cost: string;
  qty_received?: number;
  is_closed?: boolean;
}

export function CreatePoDialog({
  suppliers,
  skus,
  prefill,
  onClose,
  onCreated,
  onSupplierCreated,
}: {
  suppliers: Supplier[];
  skus: SkuOption[];
  prefill: { sku: string; qty: number } | null;
  onClose: () => void;
  onCreated: (po: PurchaseOrder) => void;
  onSupplierCreated: (s: Supplier) => void;
}) {
  const prefillSku = useMemo(() => {
    if (!prefill) return null;
    return skus.find((s) => s.sku_code === prefill.sku) ?? null;
  }, [prefill, skus]);

  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [status, setStatus] = useState<PoStatus>("planned");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [downPaymentPct, setDownPaymentPct] = useState("30");
  const [discountAmount, setDiscountAmount] = useState("");
  const [taxPct, setTaxPct] = useState(String(DEFAULT_PO_TAX_PCT));
  const [pphPct, setPphPct] = useState("0");
  const [otherCharges, setOtherCharges] = useState("");
  const [currency, setCurrency] = useState<string>(DEFAULT_PO_CURRENCY);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    {
      sku_id: prefillSku?.id ?? "",
      qty_ordered: prefill?.qty ? String(prefill.qty) : "",
      unit_cost: "",
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);

  const lineSkuIds = useMemo(
    () => lines.map((l) => l.sku_id).filter(Boolean),
    [lines],
  );
  const { costsBySkuId } = useLastPurchaseCosts(lineSkuIds, currency);
  const { terms: usualTerms, loading: usualTermsLoading } =
    useSupplierUsualTerms(supplierId || null);
  const appliedUsualTermsFor = useRef<string>("");

  // Apply this supplier's usual DP / VAT once their history has loaded.
  useEffect(() => {
    if (!supplierId) {
      appliedUsualTermsFor.current = "";
      return;
    }
    if (usualTermsLoading) return;
    if (appliedUsualTermsFor.current === supplierId) return;
    appliedUsualTermsFor.current = supplierId;
    if (usualTerms) {
      setDownPaymentPct(formatPctInput(usualTerms.downPayment.value));
      setTaxPct(formatPctInput(usualTerms.vat.value));
      return;
    }
    setDownPaymentPct("30");
    setTaxPct(String(DEFAULT_PO_TAX_PCT));
  }, [supplierId, usualTerms, usualTermsLoading]);

  // Prefill empty unit costs once last purchase price is known for the currency.
  useEffect(() => {
    if (costsBySkuId.size === 0) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        if (!line.sku_id || line.unit_cost.trim()) return line;
        const last = costsBySkuId.get(line.sku_id);
        if (!last) return line;
        changed = true;
        return { ...line, unit_cost: formatUnitCostInput(last.unit_cost) };
      });
      return changed ? next : prev;
    });
  }, [costsBySkuId]);

  const previewTotals = useMemo(() => {
    const cleanLines = lines
      .filter((l) => l.sku_id && Number(l.qty_ordered) > 0)
      .map((l) => ({
        id: "",
        po_id: "",
        sku_id: l.sku_id,
        qty_ordered: Number(l.qty_ordered),
        qty_received: 0,
        is_closed: false,
        unit_cost: l.unit_cost ? Number(l.unit_cost) : null,
      }));
    return computePoInvoiceTotals({
      lines: cleanLines,
      discount_amount: discountAmount ? Number(discountAmount) : 0,
      tax_pct: taxPct !== "" ? Number(taxPct) : DEFAULT_PO_TAX_PCT,
      pph_pct: pphPct !== "" ? Number(pphPct) : 0,
      other_charges: otherCharges ? Number(otherCharges) : 0,
      down_payment_pct: downPaymentPct ? Number(downPaymentPct) : 30,
    });
  }, [lines, discountAmount, taxPct, pphPct, otherCharges, downPaymentPct]);

  const previewFmt = (value: number) => formatPoMoney(value, currency);

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }

  function handleSkuChange(idx: number, skuId: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next: DraftLine = { ...l, sku_id: skuId };
        if (skuId && !l.unit_cost.trim()) {
          const last = costsBySkuId.get(skuId);
          if (last) {
            next.unit_cost = formatUnitCostInput(last.unit_cost);
          }
        }
        if (!skuId) {
          // Keep unit cost if user clears SKU? Clear suggestion context only.
        }
        return next;
      }),
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
    const cleanLines = lines
      .filter((l) => l.sku_id && Number(l.qty_ordered) > 0)
      .map((l) => ({
        sku_id: l.sku_id,
        qty_ordered: Number(l.qty_ordered),
        unit_cost: l.unit_cost ? Number(l.unit_cost) : null,
      }));

    if (cleanLines.length === 0) {
      setFormError("Add at least one line with a SKU and quantity.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/procurement/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_number: poNumber.trim() || undefined,
          supplier_id: supplierId || null,
          status,
          order_date: orderDate || null,
          expected_date: expectedDate || null,
          down_payment_pct: downPaymentPct ? Number(downPaymentPct) : 30,
          discount_amount: discountAmount ? Number(discountAmount) : 0,
          tax_pct: taxPct !== "" ? Number(taxPct) : DEFAULT_PO_TAX_PCT,
          pph_pct: pphPct !== "" ? Number(pphPct) : 0,
          other_charges: otherCharges ? Number(otherCharges) : 0,
          currency,
          notes: notes || null,
          lines: cleanLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create PO");
      onCreated(data.purchaseOrder);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="New purchase order"
      description="Order stock from a supplier. Set status to Ordered so it nets against the forecast."
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-stone-700">PO number</span>
          <Input
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            placeholder="Auto-generated if left blank"
          />
          <span className="text-xs text-stone-500">
            Optional. Use your vendor reference, e.g. PO FTI-47-29052026.
          </span>
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
              {STATUS_FLOW.map((s) => (
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
            <span className="text-sm font-medium text-stone-700">
              Order date
            </span>
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
          <div className="space-y-1">
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
            <SupplierUsualPctHint
              term={usualTerms?.downPayment}
              poCount={usualTerms?.poCount ?? 0}
              currentValue={downPaymentPct}
              onApply={setDownPaymentPct}
            />
          </div>
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
          <div className="space-y-1">
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">VAT %</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                placeholder={String(DEFAULT_PO_TAX_PCT)}
              />
            </label>
            <SupplierUsualPctHint
              term={usualTerms?.vat}
              poCount={usualTerms?.poCount ?? 0}
              currentValue={taxPct}
              onApply={setTaxPct}
            />
            <span className="text-xs text-stone-500">
              Added on top of line totals. Set to 0 if the vendor does not charge VAT.
            </span>
          </div>
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
            <span className="text-xs text-stone-500">
              Withholding tax on pre-VAT amount, deducted from the invoice. Use 2
              for standard vendor PPh.
            </span>
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
            <span className="text-xs text-stone-500">
              Extra costs added on top of the invoice total.
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-700">
              Line items
            </span>
            <Button size="sm" variant="ghost" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
          </div>
          {lines.map((line, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex gap-2">
                <SkuSearchInput
                  className="flex-1"
                  options={skus}
                  value={skus.find((s) => s.id === line.sku_id) ?? null}
                  onChange={(option) =>
                    handleSkuChange(idx, option?.id ?? "")
                  }
                  placeholder="Search SKU or name…"
                />
                <Input
                  className="w-24"
                  type="number"
                  min="0"
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
                  step={PO_UNIT_COST_STEP}
                  placeholder="Unit cost"
                  value={line.unit_cost}
                  onChange={(e) => updateLine(idx, { unit_cost: e.target.value })}
                />
                {lines.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeLine(idx)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {line.sku_id ? (
                <LastPurchaseCostSuggestion
                  cost={costsBySkuId.get(line.sku_id)}
                  currentUnitCost={line.unit_cost}
                  onApply={(unitCost) => updateLine(idx, { unit_cost: unitCost })}
                />
              ) : null}
            </div>
          ))}
        </div>

        {previewTotals.subtotal > 0 && (
          <div className="rounded-lg bg-stone-50 p-3">
            <PoInvoiceTotalsView totals={previewTotals} fmt={previewFmt} />
          </div>
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
            {saving ? "Saving..." : "Create PO"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
