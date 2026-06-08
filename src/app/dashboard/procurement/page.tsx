"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, PackageCheck, Truck, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SkuSearchInput } from "@/components/packaging/sku-search-input";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type {
  PoStatus,
  PurchaseOrder,
  PurchaseOrderLine,
  Supplier,
} from "@/types/database";
import type { PoLineCoverage } from "@/lib/forecast/po-coverage";
import {
  DEFAULT_LEAD_TIME_MONTHS,
  DEFAULT_SAFETY_STOCK_MONTHS,
} from "@/lib/forecast/demand";

interface SkuOption {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_name?: string | null;
}

const STATUS_LABELS: Record<PoStatus, string> = {
  planned: "Planned",
  ordered: "Ordered",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<PoStatus, string> = {
  planned: "bg-stone-100 text-stone-700",
  ordered: "bg-sky-100 text-sky-800",
  in_transit: "bg-amber-100 text-amber-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};

const STATUS_FLOW: PoStatus[] = ["planned", "ordered", "in_transit", "received"];

function StatusBadge({ status }: { status: PoStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>;
}

function lineTotal(line: PurchaseOrderLine): number {
  return (line.unit_cost ?? 0) * line.qty_ordered;
}

function poTotal(po: PurchaseOrder): number {
  return (po.lines ?? []).reduce((sum, l) => sum + lineTotal(l), 0);
}

function poOpenQty(po: PurchaseOrder): number {
  return (po.lines ?? []).reduce(
    (sum, l) => sum + Math.max(0, l.qty_ordered - l.qty_received),
    0,
  );
}

function ProcurementInner() {
  const searchParams = useSearchParams();
  const initialSku = searchParams.get("sku");
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<PoStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(Boolean(initialSku));
  const [detailPo, setDetailPo] = useState<PurchaseOrder | null>(null);
  const [prefill, setPrefill] = useState<{ sku: string; qty: number } | null>(
    initialSku
      ? { sku: initialSku, qty: Number(searchParams.get("qty") ?? 0) }
      : null,
  );
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [supRes, skuRes] = await Promise.all([
          fetch("/api/procurement/suppliers"),
          fetch("/api/procurement/skus"),
        ]);
        const supData = await supRes.json();
        const skuData = await skuRes.json();
        if (!active) return;
        setSuppliers(supData.suppliers ?? []);
        setSkus(skuData.skus ?? []);
      } catch {
        // metadata is optional for browsing
      }
    }
    loadMeta();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPos() {
      setLoading(true);
      setError(null);
      try {
        const qs = statusFilter ? `?status=${statusFilter}` : "";
        const res = await fetch(`/api/procurement/pos${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!active) return;
        setPos(data.purchaseOrders ?? []);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPos();
    return () => {
      active = false;
    };
  }, [statusFilter, refreshKey]);

  const summary = useMemo(() => {
    const open = pos.filter((p) =>
      ["planned", "ordered", "in_transit"].includes(p.status),
    );
    const unitsOnOrder = pos
      .filter((p) => ["ordered", "in_transit"].includes(p.status))
      .reduce((sum, p) => sum + poOpenQty(p), 0);
    const openValue = open.reduce((sum, p) => sum + poTotal(p), 0);
    const arrivingSoon = pos.filter(
      (p) =>
        ["ordered", "in_transit"].includes(p.status) &&
        p.expected_date &&
        new Date(p.expected_date).getTime() < now + 30 * 24 * 60 * 60 * 1000,
    ).length;
    return {
      openCount: open.length,
      unitsOnOrder,
      openValue,
      arrivingSoon,
    };
  }, [pos, now]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Procurement & restocks
          </h1>
          <p className="mt-1 text-stone-600">
            Raise purchase orders, track them from planned to received, and log
            partial deliveries. Open orders feed back into the demand forecast.
          </p>
        </div>
        <Button
          onClick={() => {
            setPrefill(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New purchase order
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Open POs" value={formatNumber(summary.openCount)} />
        <SummaryStat
          label="Units on order"
          value={formatNumber(summary.unitsOnOrder)}
        />
        <SummaryStat
          label="Open PO value"
          value={formatCurrency(summary.openValue)}
        />
        <SummaryStat
          label="Arriving in 30 days"
          value={formatNumber(summary.arrivingSoon)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === "" ? "default" : "outline"}
          onClick={() => setStatusFilter("")}
        >
          All
        </Button>
        {STATUS_FLOW.concat("cancelled").map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
          <CardDescription>
            {pos.length} order{pos.length === 1 ? "" : "s"}
            {statusFilter ? ` · ${STATUS_LABELS[statusFilter]}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-stone-500">Loading purchase orders...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : pos.length === 0 ? (
            <p className="text-sm text-stone-500">
              No purchase orders yet. Create one from a forecast recommendation
              or with the button above.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="py-2 pr-4">PO</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Lines</th>
                  <th className="py-2 pr-4">Open qty</th>
                  <th className="py-2 pr-4">Value</th>
                  <th className="py-2 pr-4">Expected</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => (
                  <tr key={po.id} className="border-b border-stone-100">
                    <td className="py-2 pr-4 font-medium text-stone-900">
                      {po.po_number}
                    </td>
                    <td className="py-2 pr-4">{po.supplier_name ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="py-2 pr-4">{po.lines?.length ?? 0}</td>
                    <td className="py-2 pr-4">{formatNumber(poOpenQty(po))}</td>
                    <td className="py-2 pr-4">{formatCurrency(poTotal(po))}</td>
                    <td className="py-2 pr-4">{po.expected_date ?? "—"}</td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailPo(po)}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreatePoDialog
          suppliers={suppliers}
          skus={skus}
          prefill={prefill}
          onSupplierCreated={(s) => setSuppliers((prev) => [...prev, s])}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {detailPo && (
        <PoDetailDialog
          poId={detailPo.id}
          onClose={() => setDetailPo(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-stone-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
      </CardContent>
    </Card>
  );
}

interface DraftLine {
  id?: string;
  sku_id: string;
  qty_ordered: string;
  unit_cost: string;
  qty_received?: number;
}

function CreatePoDialog({
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
  onCreated: () => void;
  onSupplierCreated: (s: Supplier) => void;
}) {
  const prefillSku = useMemo(() => {
    if (!prefill) return null;
    return skus.find((s) => s.sku_code === prefill.sku) ?? null;
  }, [prefill, skus]);

  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<PoStatus>("planned");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
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
          supplier_id: supplierId || null,
          status,
          order_date: orderDate || null,
          expected_date: expectedDate || null,
          notes: notes || null,
          lines: cleanLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create PO");
      onCreated();
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
            <div key={idx} className="flex gap-2">
              <SkuSearchInput
                className="flex-1"
                options={skus}
                value={skus.find((s) => s.id === line.sku_id) ?? null}
                onChange={(option) =>
                  updateLine(idx, { sku_id: option?.id ?? "" })
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
          ))}
        </div>

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

function EditPoDialog({
  po,
  suppliers,
  skus,
  onClose,
  onSaved,
  onSupplierCreated,
}: {
  po: PurchaseOrder;
  suppliers: Supplier[];
  skus: SkuOption[];
  onClose: () => void;
  onSaved: (updated: PurchaseOrder) => void;
  onSupplierCreated: (s: Supplier) => void;
}) {
  const locked =
    po.status === "received" || po.status === "cancelled";
  const [supplierId, setSupplierId] = useState(po.supplier_id ?? "");
  const [status, setStatus] = useState<PoStatus>(po.status);
  const [orderDate, setOrderDate] = useState(po.order_date ?? "");
  const [expectedDate, setExpectedDate] = useState(po.expected_date ?? "");
  const [notes, setNotes] = useState(po.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    (po.lines ?? []).map((l) => ({
      id: l.id,
      sku_id: l.sku_id,
      qty_ordered: String(l.qty_ordered),
      unit_cost: l.unit_cost != null ? String(l.unit_cost) : "",
      qty_received: l.qty_received,
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

        payload.supplier_id = supplierId || null;
        payload.status = status;
        payload.order_date = orderDate || null;
        payload.expected_date = expectedDate || null;
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">
                  Supplier
                </span>
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
              {lines.map((line, idx) => {
                const received = line.qty_received ?? 0;
                const lockedLine = received > 0;
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

function PoDetailDialog({
  poId,
  onClose,
  onChanged,
}: {
  poId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [coverage, setCoverage] = useState<PoLineCoverage[]>([]);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const coverageByLine = useMemo(
    () => new Map(coverage.map((c) => [c.line_id, c])),
    [coverage],
  );

  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [supRes, skuRes] = await Promise.all([
          fetch("/api/procurement/suppliers"),
          fetch("/api/procurement/skus"),
        ]);
        const supData = await supRes.json();
        const skuData = await skuRes.json();
        if (!active) return;
        setSuppliers(supData.suppliers ?? []);
        setSkus(skuData.skus ?? []);
      } catch {
        // optional
      }
    }
    loadMeta();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/procurement/pos/${poId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (active) setPo(data.purchaseOrder);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [poId]);

  useEffect(() => {
    let active = true;
    async function loadCoverage() {
      if (!po?.expected_date) {
        setCoverage([]);
        return;
      }
      setCoverageLoading(true);
      try {
        const res = await fetch(`/api/procurement/pos/${poId}/coverage`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "Failed");
        setCoverage(data.coverage ?? []);
      } catch {
        if (active) setCoverage([]);
      } finally {
        if (active) setCoverageLoading(false);
      }
    }
    if (po) loadCoverage();
    return () => {
      active = false;
    };
  }, [poId, po?.expected_date, po?.updated_at]);

  async function setStatus(status: PoStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/pos/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPo(data.purchaseOrder);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function receive(lineId: string) {
    const qty = Number(receiveQty[lineId]);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/pos/${poId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_line_id: lineId, qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPo(data.purchaseOrder);
      setReceiveQty((prev) => ({ ...prev, [lineId]: "" }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!po) return;
    const hasReceipts = (po.lines ?? []).some((l) => l.qty_received > 0);
    if (hasReceipts) {
      setError(
        "This PO has received items and cannot be deleted. Cancel it instead.",
      );
      return;
    }
    if (
      !window.confirm(
        `Delete purchase order ${po.po_number}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/pos/${poId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete PO");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete PO");
    } finally {
      setBusy(false);
    }
  }

  const canDelete = po && !(po.lines ?? []).some((l) => l.qty_received > 0);

  return (
    <>
      <Dialog
        open={!editOpen}
        onClose={onClose}
        title={po ? `Purchase order ${po.po_number}` : "Purchase order"}
        description={po?.supplier_name ?? undefined}
        className="max-w-3xl"
      >
      {loading ? (
        <p className="text-sm text-stone-500">Loading...</p>
      ) : !po ? (
        <p className="text-sm text-red-600">{error ?? "Not found"}</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={po.status} />
            {po.expected_date && (
              <span className="text-sm text-stone-500">
                Expected {po.expected_date}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditOpen(true)}
                disabled={busy}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              {canDelete && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={busy}
                  className="text-rose-700 hover:text-rose-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
              {po.status !== "received" && po.status !== "cancelled" && (
                <>
                  {nextStatus(po.status) && (
                    <Button
                      size="sm"
                      onClick={() => setStatus(nextStatus(po.status)!)}
                      disabled={busy}
                    >
                      {po.status === "planned" && (
                        <Truck className="h-3.5 w-3.5" />
                      )}
                      Mark {STATUS_LABELS[nextStatus(po.status)!]}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus("cancelled")}
                    disabled={busy}
                  >
                    Cancel PO
                  </Button>
                </>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!po.expected_date ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Set an expected delivery date to see when this batch runs out and
              when the next reorder is due after earlier stock and POs are
              consumed.
            </p>
          ) : coverageLoading ? (
            <p className="text-sm text-stone-500">Calculating coverage…</p>
          ) : coverage.length > 0 ? (
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
              <p>
                Assumes current on-hand stock is used first, then earlier open
                POs by delivery date, then this order. Next reorder is when
                inventory hits the reorder point (
                {DEFAULT_LEAD_TIME_MONTHS}-month lead +{" "}
                {DEFAULT_SAFETY_STOCK_MONTHS}-month buffer) after the latest
                incoming batch lands.
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Ordered</th>
                  <th className="py-2 pr-4">Received</th>
                  {po.expected_date && (
                    <>
                      <th className="py-2 pr-4">Batch runs out</th>
                      <th className="py-2 pr-4">Next reorder</th>
                    </>
                  )}
                  <th className="py-2 pr-4">Receive</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {(po.lines ?? []).map((line) => {
                  const open = line.qty_ordered - line.qty_received;
                  const fully = open <= 0;
                  const lineCoverage = coverageByLine.get(line.id);
                  return (
                    <tr key={line.id} className="border-b border-stone-100">
                      <td className="py-2 pr-4">
                        <span className="font-medium text-stone-900">
                          {line.sku_code}
                        </span>
                        {line.sku_name && (
                          <span className="block text-xs text-stone-500">
                            {line.sku_name}
                          </span>
                        )}
                        {lineCoverage?.is_latest_batch && (
                          <span className="mt-0.5 block text-xs text-sky-700">
                            Latest incoming batch
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {formatNumber(line.qty_ordered)}
                      </td>
                      <td className="py-2 pr-4">
                        {formatNumber(line.qty_received)}
                      </td>
                      {po.expected_date && (
                        <>
                          <td className="py-2 pr-4 text-stone-700">
                            {fully
                              ? "—"
                              : lineCoverage?.batch_depletion_date ?? "—"}
                          </td>
                          <td className="py-2 pr-4 font-medium text-stone-900">
                            {fully
                              ? "—"
                              : (lineCoverage?.next_reorder_date ?? "—")}
                          </td>
                        </>
                      )}
                      <td className="py-2 pr-4">
                        {fully ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <PackageCheck className="h-4 w-4" />
                            Complete
                          </span>
                        ) : (
                          <Input
                            className="w-24"
                            type="number"
                            min="0"
                            max={open}
                            placeholder={String(open)}
                            value={receiveQty[line.id] ?? ""}
                            onChange={(e) =>
                              setReceiveQty((prev) => ({
                                ...prev,
                                [line.id]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {!fully && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => receive(line.id)}
                            disabled={busy || !receiveQty[line.id]}
                          >
                            Receive
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(po.lines ?? []).some((l) => (l.receipts?.length ?? 0) > 0) && (
            <div>
              <p className="mb-2 text-sm font-medium text-stone-700">
                Receipt history
              </p>
              <ul className="space-y-1 text-sm text-stone-600">
                {(po.lines ?? []).flatMap((line) =>
                  (line.receipts ?? []).map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span>
                        {line.sku_code} · {formatNumber(r.qty_received)} units
                        into {r.location}
                      </span>
                      <span className="text-stone-400">{r.received_date}</span>
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}

          {po.notes && (
            <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
              {po.notes}
            </p>
          )}
        </div>
      )}
      </Dialog>

      {editOpen && po && (
        <EditPoDialog
          po={po}
          suppliers={suppliers}
          skus={skus}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setPo(updated);
            setEditOpen(false);
            onChanged();
          }}
          onSupplierCreated={(s) => setSuppliers((prev) => [...prev, s])}
        />
      )}
    </>
  );
}

function nextStatus(status: PoStatus): PoStatus | null {
  const idx = STATUS_FLOW.indexOf(status);
  if (idx < 0 || idx >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

export default function ProcurementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <ProcurementInner />
    </Suspense>
  );
}
