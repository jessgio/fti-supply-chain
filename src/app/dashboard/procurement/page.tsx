"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  PackageCheck,
  Truck,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  FileText,
  Settings,
  Building2,
  Tags,
} from "lucide-react";
import Link from "next/link";
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
import { formatNumber } from "@/lib/utils";
import {
  DEFAULT_PO_CURRENCY,
  formatPoMoney,
  PO_CURRENCIES,
} from "@/lib/procurement/currencies";
import {
  computePoInvoiceTotals,
  DEFAULT_PO_TAX_PCT,
  taxLabel,
} from "@/lib/procurement/po-totals";
import { formatSupplierPoNotes } from "@/lib/procurement/supplier-po-notes";
import type {
  CompanySettings,
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
  is_bundle?: boolean;
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

function poOpenQty(po: PurchaseOrder): number {
  return (po.lines ?? []).reduce(
    (sum, l) => sum + Math.max(0, l.qty_ordered - l.qty_received),
    0,
  );
}

function poInvoiceTotal(po: PurchaseOrder): number {
  return computePoInvoiceTotals(po).invoiceTotal;
}

async function downloadPoPdf(poId: string, poNumber: string) {
  const res = await fetch(`/api/procurement/pos/${poId}/pdf`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Failed to generate PDF",
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${poNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
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
  const [openValue, setOpenValue] = useState<string>("—");
  const [openValueLoading, setOpenValueLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(Boolean(initialSku));
  const [detailPo, setDetailPo] = useState<PurchaseOrder | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [skuQuery, setSkuQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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

  useEffect(() => {
    let active = true;
    async function loadOpenValue() {
      setOpenValueLoading(true);
      try {
        const qs = statusFilter ? `?status=${statusFilter}` : "";
        const res = await fetch(`/api/procurement/open-value${qs}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load open value");
        setOpenValue(data.formatted ?? formatPoMoney(0, DEFAULT_PO_CURRENCY));
      } catch {
        if (active) setOpenValue("Unavailable");
      } finally {
        if (active) setOpenValueLoading(false);
      }
    }
    loadOpenValue();
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
    const arrivingSoon = pos.filter(
      (p) =>
        ["ordered", "in_transit"].includes(p.status) &&
        p.expected_date &&
        new Date(p.expected_date).getTime() < now + 30 * 24 * 60 * 60 * 1000,
    ).length;
    return {
      openCount: open.length,
      unitsOnOrder,
      arrivingSoon,
    };
  }, [pos, now]);

  const skuQ = skuQuery.trim().toLowerCase();

  const lineMatchesSku = (line: PurchaseOrderLine): boolean =>
    skuQ.length > 0 &&
    ((line.sku_code ?? "").toLowerCase().includes(skuQ) ||
      (line.sku_name ?? "").toLowerCase().includes(skuQ));

  const filteredPos = useMemo(() => {
    if (!skuQ) return pos;
    return pos.filter((po) => (po.lines ?? []).some(lineMatchesSku));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, skuQ]);

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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSuppliersOpen(true)}>
            <Building2 className="h-4 w-4" />
            Suppliers
          </Button>
          <Link
            href="/dashboard/procurement/vendor-products"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50"
          >
            <Tags className="h-4 w-4" />
            Vendor product names
          </Link>
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
            Company info
          </Button>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Open POs" value={formatNumber(summary.openCount)} />
        <SummaryStat
          label="Units on order"
          value={formatNumber(summary.unitsOnOrder)}
        />
        <SummaryStat
          label="Open PO value"
          value={openValueLoading ? "…" : openValue}
          hint="Converted to IDR at order-date rates"
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Purchase orders</CardTitle>
              <CardDescription>
                {skuQ
                  ? `${filteredPos.length} of ${pos.length} order${
                      pos.length === 1 ? "" : "s"
                    } contain “${skuQuery.trim()}”`
                  : `${pos.length} order${pos.length === 1 ? "" : "s"}`}
                {statusFilter ? ` · ${STATUS_LABELS[statusFilter]}` : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-8 pr-8"
                placeholder="Find POs by SKU or name…"
                value={skuQuery}
                onChange={(e) => setSkuQuery(e.target.value)}
              />
              {skuQuery && (
                <button
                  type="button"
                  onClick={() => setSkuQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label="Clear SKU search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
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
          ) : filteredPos.length === 0 ? (
            <p className="text-sm text-stone-500">
              No purchase orders contain a SKU matching “{skuQuery.trim()}”.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="w-8 py-2" />
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
                {filteredPos.map((po) => {
                  const isOpen = expanded.has(po.id) || skuQ.length > 0;
                  const lines = po.lines ?? [];
                  return (
                    <Fragment key={po.id}>
                      <tr className="border-b border-stone-100">
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(po.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                            aria-label={isOpen ? "Collapse" : "Expand"}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-2 pr-4 font-medium text-stone-900">
                          {po.po_number}
                        </td>
                        <td className="py-2 pr-4">{po.supplier_name ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={po.status} />
                        </td>
                        <td className="py-2 pr-4">{lines.length}</td>
                        <td className="py-2 pr-4">
                          {formatNumber(poOpenQty(po))}
                        </td>
                        <td className="py-2 pr-4">
                          {formatPoMoney(poInvoiceTotal(po), po.currency)}
                        </td>
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
                      {isOpen && (
                        <tr className="border-b border-stone-100 bg-stone-50/60">
                          <td />
                          <td colSpan={8} className="py-2 pr-4">
                            {lines.length === 0 ? (
                              <p className="py-1 text-xs text-stone-500">
                                No line items.
                              </p>
                            ) : (
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-stone-400">
                                    <th className="py-1 pr-4 font-medium">
                                      SKU
                                    </th>
                                    <th className="py-1 pr-4 text-right font-medium">
                                      Ordered
                                    </th>
                                    <th className="py-1 pr-4 text-right font-medium">
                                      Received
                                    </th>
                                    <th className="py-1 pr-4 text-right font-medium">
                                      Open
                                    </th>
                                    <th className="py-1 pr-4 text-right font-medium">
                                      Unit cost
                                    </th>
                                    <th className="py-1 text-right font-medium">
                                      Line value
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lines.map((line) => {
                                    const open = Math.max(
                                      0,
                                      line.qty_ordered - line.qty_received,
                                    );
                                    const matched = lineMatchesSku(line);
                                    return (
                                      <tr
                                        key={line.id}
                                        className={
                                          matched
                                            ? "bg-amber-100/70"
                                            : undefined
                                        }
                                      >
                                        <td className="py-1 pr-4">
                                          <span className="font-medium text-stone-800">
                                            {line.sku_code ?? "—"}
                                          </span>
                                          {line.sku_name &&
                                            line.sku_name !== line.sku_code && (
                                              <span className="block text-stone-500">
                                                {line.sku_name}
                                              </span>
                                            )}
                                        </td>
                                        <td className="py-1 pr-4 text-right">
                                          {formatNumber(line.qty_ordered)}
                                        </td>
                                        <td className="py-1 pr-4 text-right">
                                          {formatNumber(line.qty_received)}
                                        </td>
                                        <td className="py-1 pr-4 text-right">
                                          {formatNumber(open)}
                                        </td>
                                        <td className="py-1 pr-4 text-right">
                                          {line.unit_cost != null
                                            ? formatPoMoney(
                                                line.unit_cost,
                                                po.currency,
                                              )
                                            : "—"}
                                        </td>
                                        <td className="py-1 text-right">
                                          {formatPoMoney(
                                            lineTotal(line),
                                            po.currency,
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
          onCreated={(created) => {
            setCreateOpen(false);
            setRefreshKey((k) => k + 1);
            setDetailPo(created);
          }}
        />
      )}

      {settingsOpen && (
        <CompanySettingsDialog
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {suppliersOpen && (
        <SuppliersDialog
          suppliers={suppliers}
          onClose={() => setSuppliersOpen(false)}
          onUpdated={(updated) =>
            setSuppliers((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s)),
            )
          }
          onCreated={(created) =>
            setSuppliers((prev) => [...prev, created])
          }
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

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-stone-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
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

  const previewTotals = useMemo(() => {
    const cleanLines = lines
      .filter((l) => l.sku_id && Number(l.qty_ordered) > 0)
      .map((l) => ({
        id: "",
        po_id: "",
        sku_id: l.sku_id,
        qty_ordered: Number(l.qty_ordered),
        qty_received: 0,
        unit_cost: l.unit_cost ? Number(l.unit_cost) : null,
      }));
    return computePoInvoiceTotals({
      lines: cleanLines,
      discount_amount: discountAmount ? Number(discountAmount) : 0,
      tax_pct: taxPct !== "" ? Number(taxPct) : DEFAULT_PO_TAX_PCT,
      other_charges: otherCharges ? Number(otherCharges) : 0,
      down_payment_pct: downPaymentPct ? Number(downPaymentPct) : 30,
    });
  }, [lines, discountAmount, taxPct, otherCharges, downPaymentPct]);

  const previewFmt = (value: number) => formatPoMoney(value, currency);

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
          po_number: poNumber.trim() || undefined,
          supplier_id: supplierId || null,
          status,
          order_date: orderDate || null,
          expected_date: expectedDate || null,
          down_payment_pct: downPaymentPct ? Number(downPaymentPct) : 30,
          discount_amount: discountAmount ? Number(discountAmount) : 0,
          tax_pct: taxPct !== "" ? Number(taxPct) : DEFAULT_PO_TAX_PCT,
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
            <span className="text-sm font-medium text-stone-700">Tax %</span>
            <Input
              type="number"
              min="0"
              max="100"
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
              placeholder={String(DEFAULT_PO_TAX_PCT)}
            />
            <span className="text-xs text-stone-500">
              Set to 0 if the vendor does not charge tax.
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

        {previewTotals.subtotal > 0 && (
          <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{previewFmt(previewTotals.subtotal)}</span>
            </div>
            {previewTotals.discount > 0 && (
              <div className="mt-1 flex justify-between">
                <span>Discount</span>
                <span>-{previewFmt(previewTotals.discount)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between">
              <span>{taxLabel(previewTotals.taxPct)}</span>
              <span>{previewFmt(previewTotals.tax)}</span>
            </div>
            {previewTotals.otherCharges > 0 && (
              <div className="mt-1 flex justify-between">
                <span>Other</span>
                <span>{previewFmt(previewTotals.otherCharges)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between font-medium text-stone-900">
              <span>Invoice total</span>
              <span>{previewFmt(previewTotals.invoiceTotal)}</span>
            </div>
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
        payload.down_payment_pct = downPaymentPct
          ? Number(downPaymentPct)
          : 30;
        payload.discount_amount = discountAmount ? Number(discountAmount) : 0;
        payload.tax_pct = taxPct !== "" ? Number(taxPct) : DEFAULT_PO_TAX_PCT;
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
              <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">
                  Currency
                </span>
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
                <span className="text-sm font-medium text-stone-700">Tax %</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
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
  const [pdfError, setPdfError] = useState<string | null>(null);

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
            <span className="text-sm font-medium text-stone-600">
              {po.currency ?? DEFAULT_PO_CURRENCY}
            </span>
            {po.expected_date && (
              <span className="text-sm text-stone-500">
                Expected {po.expected_date}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setPdfError(null);
                  try {
                    await downloadPoPdf(po.id, po.po_number);
                  } catch (err) {
                    setPdfError(
                      err instanceof Error ? err.message : "Failed to download PDF",
                    );
                  }
                }}
                disabled={busy}
              >
                <FileText className="h-3.5 w-3.5" />
                Download PDF
              </Button>
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
          {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}

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

          {(() => {
            const totals = computePoInvoiceTotals(po);
            const fmt = (value: number) => formatPoMoney(value, po.currency);
            return (
              <div className="rounded-lg bg-stone-50 p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                  {po.currency ?? DEFAULT_PO_CURRENCY}
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-stone-600">Subtotal</span>
                  <span className="font-medium text-stone-900">
                    {fmt(totals.subtotal)}
                  </span>
                </div>
                {totals.discount > 0 && (
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="text-stone-600">Discount</span>
                    <span className="font-medium text-stone-900">
                      -{fmt(totals.discount)}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-stone-600">{taxLabel(totals.taxPct)}</span>
                  <span className="font-medium text-stone-900">
                    {fmt(totals.tax)}
                  </span>
                </div>
                {totals.otherCharges > 0 && (
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="text-stone-600">Other</span>
                    <span className="font-medium text-stone-900">
                      {fmt(totals.otherCharges)}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-2 text-sm">
                  <span className="font-medium text-stone-700">Invoice total</span>
                  <span className="font-semibold text-stone-900">
                    {fmt(totals.invoiceTotal)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-stone-600">
                    Down payment ({totals.downPaymentPct}%)
                  </span>
                  <span className="font-medium text-stone-900">
                    {fmt(totals.downPayment)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-2 text-sm">
                  <span className="font-medium text-stone-700">Final payment</span>
                  <span className="font-semibold text-stone-900">
                    {fmt(totals.finalPayment)}
                  </span>
                </div>
              </div>
            );
          })()}

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

function CompanySettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [picName, setPicName] = useState("");
  const [picEmail, setPicEmail] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/procurement/company-settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!active) return;
        const s = data.settings as CompanySettings;
        setSettings(s);
        setCompanyName(s.company_name);
        setAddress(s.address ?? "");
        setPicName(s.pic_name ?? "");
        setPicEmail(s.pic_email ?? "");
        setPicPhone(s.pic_phone ?? "");
        setLogoPath(s.logo_path ?? null);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogoUpload(file: File) {
    setLogoBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/procurement/company-settings/logo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to upload logo");
      setSettings(data.settings);
      setLogoPath(data.settings.logo_path ?? null);
      setLogoVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoRemove() {
    setLogoBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/company-settings/logo", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove logo");
      setSettings(data.settings);
      setLogoPath(null);
      setLogoVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/company-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          address: address || null,
          pic_name: picName || null,
          pic_email: picEmail || null,
          pic_phone: picPhone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSettings(data.settings);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Company information"
      description="Shown on purchase order PDFs as the buyer."
    >
      {loading ? (
        <p className="text-sm text-stone-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium text-stone-700">
              Company logo
            </span>
            <p className="text-xs text-stone-500">
              Shown at the top of purchase order PDFs. PNG or JPEG, max 2 MB.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {logoPath ? (
                <img
                  src={`/api/procurement/company-settings/logo?v=${logoVersion}`}
                  alt="Company logo"
                  className="h-12 max-w-[160px] rounded border border-stone-200 bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-32 items-center justify-center rounded border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-400">
                  No logo
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={logoBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleLogoUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={logoBusy}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoBusy ? "Uploading..." : logoPath ? "Replace" : "Upload"}
                </Button>
                {logoPath && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={logoBusy}
                    onClick={() => void handleLogoRemove()}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-stone-700">
              Company name
            </span>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-stone-700">Address</span>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, city, country"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">PIC name</span>
              <Input
                value={picName}
                onChange={(e) => setPicName(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">PIC email</span>
              <Input
                type="email"
                value={picEmail}
                onChange={(e) => setPicEmail(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">PIC phone</span>
              <Input
                value={picPhone}
                onChange={(e) => setPicPhone(e.target.value)}
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !companyName.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

const TEXTAREA_CLASS =
  "min-h-[72px] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

interface SupplierFormState {
  name: string;
  address: string;
  picName: string;
  picEmail: string;
  picPhone: string;
  paymentTerms: string;
  leadTimeNote: string;
  deliveryTime: string;
  packagingNotes: string;
  beneficiaryName: string;
  beneficiaryAccountNumber: string;
  swiftCode: string;
  beneficiaryCountry: string;
  beneficiaryAddress: string;
  beneficiaryBank: string;
  beneficiaryBankAddress: string;
  bankCode: string;
  branchCode: string;
}

function supplierToForm(s: Supplier): SupplierFormState {
  return {
    name: s.name,
    address: s.address ?? "",
    picName: s.pic_name ?? "",
    picEmail: s.pic_email ?? "",
    picPhone: s.pic_phone ?? "",
    paymentTerms: s.payment_terms ?? "",
    leadTimeNote: s.lead_time_note ?? "",
    deliveryTime: s.delivery_time ?? "",
    packagingNotes: s.packaging_notes ?? "",
    beneficiaryName: s.beneficiary_name ?? "",
    beneficiaryAccountNumber: s.beneficiary_account_number ?? "",
    swiftCode: s.swift_code ?? "",
    beneficiaryCountry: s.beneficiary_country ?? "",
    beneficiaryAddress: s.beneficiary_address ?? "",
    beneficiaryBank: s.beneficiary_bank ?? "",
    beneficiaryBankAddress: s.beneficiary_bank_address ?? "",
    bankCode: s.bank_code ?? "",
    branchCode: s.branch_code ?? "",
  };
}

function formToSupplierPayload(form: SupplierFormState) {
  return {
    name: form.name.trim(),
    address: form.address || null,
    pic_name: form.picName || null,
    pic_email: form.picEmail || null,
    pic_phone: form.picPhone || null,
    payment_terms: form.paymentTerms || null,
    lead_time_note: form.leadTimeNote || null,
    delivery_time: form.deliveryTime || null,
    packaging_notes: form.packagingNotes || null,
    beneficiary_name: form.beneficiaryName || null,
    beneficiary_account_number: form.beneficiaryAccountNumber || null,
    swift_code: form.swiftCode || null,
    beneficiary_country: form.beneficiaryCountry || null,
    beneficiary_address: form.beneficiaryAddress || null,
    beneficiary_bank: form.beneficiaryBank || null,
    beneficiary_bank_address: form.beneficiaryBankAddress || null,
    bank_code: form.bankCode || null,
    branch_code: form.branchCode || null,
  };
}

function formToNotesPreview(form: SupplierFormState): string | null {
  return formatSupplierPoNotes({
    payment_terms: form.paymentTerms || null,
    lead_time_note: form.leadTimeNote || null,
    delivery_time: form.deliveryTime || null,
    packaging_notes: form.packagingNotes || null,
    beneficiary_name: form.beneficiaryName || null,
    beneficiary_account_number: form.beneficiaryAccountNumber || null,
    swift_code: form.swiftCode || null,
    beneficiary_country: form.beneficiaryCountry || null,
    beneficiary_address: form.beneficiaryAddress || null,
    beneficiary_bank: form.beneficiaryBank || null,
    beneficiary_bank_address: form.beneficiaryBankAddress || null,
    bank_code: form.bankCode || null,
    branch_code: form.branchCode || null,
  });
}

function SuppliersDialog({
  suppliers,
  onClose,
  onUpdated,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onUpdated: (s: Supplier) => void;
  onCreated: (s: Supplier) => void;
}) {
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormState | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notesPreview = useMemo(
    () => (form ? formToNotesPreview(form) : null),
    [form],
  );

  function patchForm(patch: Partial<SupplierFormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function startEdit(s: Supplier) {
    setEditing(s);
    setForm(supplierToForm(s));
    setError(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onCreated(data.supplier);
      setNewName("");
      startEdit(data.supplier);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!editing || !form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/suppliers/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToSupplierPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onUpdated(data.supplier);
      setEditing(null);
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Suppliers"
      description="Address, PIC, payment terms, and banking details for PO printouts."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            className="flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New supplier name"
          />
          <Button
            variant="outline"
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
          >
            Add
          </Button>
        </div>

        <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200">
          {suppliers.length === 0 ? (
            <p className="p-4 text-sm text-stone-500">No suppliers yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50 ${
                      editing?.id === s.id ? "bg-emerald-50" : ""
                    }`}
                    onClick={() => startEdit(s)}
                  >
                    <span className="font-medium text-stone-900">{s.name}</span>
                    <span className="text-xs text-stone-500">
                      {s.address ? "Address set" : "No address"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {editing && form && (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto rounded-lg bg-stone-50 p-4">
            <p className="text-sm font-medium text-stone-800">
              Edit {editing.name}
            </p>
            <label className="block space-y-1">
              <span className="text-sm text-stone-600">Name</span>
              <Input
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-stone-600">Address</span>
              <Input
                value={form.address}
                onChange={(e) => patchForm({ address: e.target.value })}
                placeholder="Manufacturer address"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm text-stone-600">PIC name</span>
                <Input
                  value={form.picName}
                  onChange={(e) => patchForm({ picName: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-stone-600">PIC email</span>
                <Input
                  type="email"
                  value={form.picEmail}
                  onChange={(e) => patchForm({ picEmail: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-stone-600">PIC phone</span>
                <Input
                  value={form.picPhone}
                  onChange={(e) => patchForm({ picPhone: e.target.value })}
                />
              </label>
            </div>

            <div className="space-y-3 border-t border-stone-200 pt-4">
              <p className="text-sm font-medium text-stone-800">
                Term of payment
              </p>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">1) Payment</span>
                <Input
                  value={form.paymentTerms}
                  onChange={(e) => patchForm({ paymentTerms: e.target.value })}
                  placeholder="30% deposit, 70% balance before shipping"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">2) Lead time</span>
                  <Input
                    value={form.leadTimeNote}
                    onChange={(e) =>
                      patchForm({ leadTimeNote: e.target.value })
                    }
                    placeholder="45-50 days"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">
                    3) Delivery time
                  </span>
                  <Input
                    value={form.deliveryTime}
                    onChange={(e) =>
                      patchForm({ deliveryTime: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">4) Packaging</span>
                <textarea
                  className={TEXTAREA_CLASS}
                  value={form.packagingNotes}
                  onChange={(e) =>
                    patchForm({ packagingNotes: e.target.value })
                  }
                  placeholder="Packaging and shipping instructions"
                />
              </label>
            </div>

            <div className="space-y-3 border-t border-stone-200 pt-4">
              <p className="text-sm font-medium text-stone-800">
                Beneficiary / bank details
              </p>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">Beneficiary name</span>
                <Input
                  value={form.beneficiaryName}
                  onChange={(e) =>
                    patchForm({ beneficiaryName: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">
                    Account number
                  </span>
                  <Input
                    value={form.beneficiaryAccountNumber}
                    onChange={(e) =>
                      patchForm({ beneficiaryAccountNumber: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">Swift code</span>
                  <Input
                    value={form.swiftCode}
                    onChange={(e) => patchForm({ swiftCode: e.target.value })}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">Country / region</span>
                <Input
                  value={form.beneficiaryCountry}
                  onChange={(e) =>
                    patchForm({ beneficiaryCountry: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">
                  Beneficiary address
                </span>
                <textarea
                  className={TEXTAREA_CLASS}
                  value={form.beneficiaryAddress}
                  onChange={(e) =>
                    patchForm({ beneficiaryAddress: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">Beneficiary bank</span>
                <Input
                  value={form.beneficiaryBank}
                  onChange={(e) =>
                    patchForm({ beneficiaryBank: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">
                  Beneficiary bank address
                </span>
                <textarea
                  className={TEXTAREA_CLASS}
                  value={form.beneficiaryBankAddress}
                  onChange={(e) =>
                    patchForm({ beneficiaryBankAddress: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">Bank code</span>
                  <Input
                    value={form.bankCode}
                    onChange={(e) => patchForm({ bankCode: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">Branch code</span>
                  <Input
                    value={form.branchCode}
                    onChange={(e) => patchForm({ branchCode: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {notesPreview && (
              <div className="space-y-2 border-t border-stone-200 pt-4">
                <p className="text-sm font-medium text-stone-800">
                  PDF notes preview
                </p>
                <pre className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-600">
                  {notesPreview}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save supplier"}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export default function ProcurementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <ProcurementInner />
    </Suspense>
  );
}
