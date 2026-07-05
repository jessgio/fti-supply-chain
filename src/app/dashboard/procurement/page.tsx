"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Search,
  X,
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
import type { PoSkuOption } from "@/components/procurement/edit-po-dialog";
import { CompanySettingsDialog } from "@/components/procurement/company-settings-dialog";
import { CreatePoDialog } from "@/components/procurement/create-po-dialog";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { SuppliersDialog } from "@/components/procurement/suppliers-dialog";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import {
  DEFAULT_PO_CURRENCY,
  formatPoMoney,
} from "@/lib/procurement/currencies";
import {
  billableLineQty,
  computePoInvoiceTotals,
  poLineOpenQty,
} from "@/lib/procurement/po-totals";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  STATUS_FLOW,
} from "@/lib/procurement/po-status";
import type {
  PoStatus,
  PurchaseOrder,
  PurchaseOrderLine,
  Supplier,
} from "@/types/database";
import {
  groupPurchaseOrdersByPrimaryGood,
  isActivePurchaseOrder,
  type PoPrimaryRole,
} from "@/lib/procurement/po-primary-groups";
import type { ProductPackagingLink } from "@/types/database";

type SkuOption = PoSkuOption;

function StatusBadge({ status }: { status: PoStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>;
}

function lineTotal(line: PurchaseOrderLine, po?: PurchaseOrder): number {
  const qty = po ? billableLineQty(line, po) : line.qty_ordered;
  return (line.unit_cost ?? 0) * qty;
}

function poOpenQty(po: PurchaseOrder): number {
  return (po.lines ?? []).reduce((sum, l) => sum + poLineOpenQty(l), 0);
}

function poInvoiceTotal(po: PurchaseOrder): number {
  return computePoInvoiceTotals(po).invoiceTotal;
}

function PoRoleBadge({ role }: { role?: PoPrimaryRole }) {
  if (!role || role === "mixed") return null;
  return (
    <Badge
      className={
        role === "packaging"
          ? "ml-2 bg-violet-100 text-violet-800"
          : "ml-2 bg-sky-100 text-sky-800"
      }
    >
      {role === "packaging" ? "Packaging" : "Filling"}
    </Badge>
  );
}

function ProcurementInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialSku = searchParams.get("sku");
  const initialPoId = searchParams.get("po");
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [packagingLinks, setPackagingLinks] = useState<ProductPackagingLink[]>([]);
  const [statusFilter, setStatusFilter] = useState<PoStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openValue, setOpenValue] = useState<string>("—");
  const [openValueLoading, setOpenValueLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(Boolean(initialSku));
  const poRedirected = useRef(false);
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
    if (initialPoId && !poRedirected.current) {
      poRedirected.current = true;
      router.replace(`/dashboard/procurement/${initialPoId}`);
    }
  }, [initialPoId, router]);

  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [supRes, skuRes, linksRes] = await Promise.all([
          fetch("/api/procurement/suppliers"),
          fetch("/api/procurement/skus"),
          fetch("/api/packaging/links"),
        ]);
        const supData = await supRes.json();
        const skuData = await skuRes.json();
        const linksData = linksRes.ok ? await linksRes.json() : { links: [] };
        if (!active) return;
        setSuppliers(supData.suppliers ?? []);
        setSkus(skuData.skus ?? []);
        setPackagingLinks(linksData.links ?? []);
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
      setOpenValueLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (statusFilter) qs.set("status", statusFilter);
        qs.set("include", "open_value");
        const res = await fetch(`/api/procurement/pos?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!active) return;
        setPos(data.purchaseOrders ?? []);
        setOpenValue(
          data.openValue?.formatted ?? formatPoMoney(0, DEFAULT_PO_CURRENCY),
        );
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setOpenValue("Unavailable");
        }
      } finally {
        if (active) {
          setLoading(false);
          setOpenValueLoading(false);
        }
      }
    }
    loadPos();
    return () => {
      active = false;
    };
  }, [statusFilter, refreshKey]);

  const summary = useMemo(() => {
    const open = pos.filter((p) =>
      ["planned", "ordered", "in_production", "in_transit"].includes(p.status),
    );
    const unitsOnOrder = pos
      .filter((p) =>
        ["ordered", "in_production", "in_transit"].includes(p.status),
      )
      .reduce((sum, p) => sum + poOpenQty(p), 0);
    const arrivingSoon = pos.filter(
      (p) =>
        ["ordered", "in_production", "in_transit"].includes(p.status) &&
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

  const poMatchesQuery = (po: PurchaseOrder): boolean => {
    if (!skuQ) return false;
    if (
      po.po_number.toLowerCase().includes(skuQ) ||
      (po.lines ?? []).some(lineMatchesSku)
    ) {
      return true;
    }

    const matchingProductIds = skus
      .filter(
        (sku) =>
          !sku.is_packaging &&
          (sku.sku_code.toLowerCase().includes(skuQ) ||
            (sku.name ?? "").toLowerCase().includes(skuQ)),
      )
      .map((sku) => sku.id);

    if (matchingProductIds.length === 0) return false;

    const linkedPackagingIds = new Set(
      packagingLinks
        .filter((link) => matchingProductIds.includes(link.product_sku_id))
        .map((link) => link.packaging_sku_id),
    );

    return (po.lines ?? []).some((line) => linkedPackagingIds.has(line.sku_id));
  };

  const filteredPos = useMemo(() => {
    if (!skuQ) return pos;
    return pos.filter(poMatchesQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, skuQ]);

  const posForGrouping = useMemo(() => {
    if (statusFilter) return filteredPos;
    return filteredPos.filter(isActivePurchaseOrder);
  }, [filteredPos, statusFilter]);

  const primaryGroups = useMemo(
    () =>
      groupPurchaseOrdersByPrimaryGood(
        posForGrouping,
        skus.map((sku) => ({
          id: sku.id,
          sku_code: sku.sku_code,
          name: sku.name,
          is_packaging: sku.is_packaging ?? false,
          is_bundle: sku.is_bundle ?? false,
        })),
        packagingLinks,
      ),
    [posForGrouping, skus, packagingLinks],
  );

  function renderPoRows(
    poList: Array<PurchaseOrder & { primaryRole?: PoPrimaryRole }>,
  ) {
    return poList.map((po) => {
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
            <td className="py-2 pr-4">
              <div className="flex flex-wrap items-center gap-1">
                <PoHoverLink
                  poId={po.id}
                  poNumber={po.po_number}
                  lineItems={(lines ?? []).map((l) => ({
                    sku_code: l.sku_code ?? "",
                    sku_name: l.sku_name ?? null,
                    qty_ordered: l.qty_ordered,
                    qty_received: l.qty_received,
                  }))}
                />
                <PoRoleBadge role={po.primaryRole} />
              </div>
            </td>
            <td className="py-2 pr-4">{po.supplier_name ?? "—"}</td>
            <td className="py-2 pr-4">
              <StatusBadge status={po.status} />
            </td>
            <td className="py-2 pr-4">{lines.length}</td>
            <td className="py-2 pr-4">{formatNumber(poOpenQty(po))}</td>
            <td className="py-2 pr-4">
              {formatPoMoney(poInvoiceTotal(po), po.currency)}
            </td>
            <td className="py-2 pr-4">{po.expected_date ?? "—"}</td>
            <td className="py-2 text-right">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/procurement/${po.id}`)}
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
                  <p className="py-1 text-xs text-stone-500">No line items.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-stone-400">
                        <th className="py-1 pr-4 font-medium">SKU</th>
                        <th className="py-1 pr-4 text-right font-medium">Ordered</th>
                        <th className="py-1 pr-4 text-right font-medium">Received</th>
                        <th className="py-1 pr-4 text-right font-medium">Open</th>
                        <th className="py-1 pr-4 text-right font-medium">Unit cost</th>
                        <th className="py-1 text-right font-medium">Line value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const open = poLineOpenQty(line);
                        const matched = lineMatchesSku(line);
                        return (
                          <tr
                            key={line.id}
                            className={matched ? "bg-amber-100/70" : undefined}
                          >
                            <td className="py-1 pr-4">
                              <span className="font-medium text-stone-800">
                                {line.sku_code ?? "—"}
                              </span>
                              {line.sku_name && line.sku_name !== line.sku_code && (
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
                                ? formatPoMoney(line.unit_cost, po.currency)
                                : "—"}
                            </td>
                            <td className="py-1 text-right">
                              {formatPoMoney(lineTotal(line, po), po.currency)}
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
    });
  }

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
            href="/dashboard/procurement/product-names"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50"
          >
            <Tags className="h-4 w-4" />
            Product names
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
          Active
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
              <CardTitle>Purchase orders by product</CardTitle>
              <CardDescription>
                {skuQ
                  ? `${posForGrouping.length} active order${
                      posForGrouping.length === 1 ? "" : "s"
                    } match “${skuQuery.trim()}”`
                  : statusFilter
                    ? `${posForGrouping.length} order${
                        posForGrouping.length === 1 ? "" : "s"
                      }`
                    : `${posForGrouping.length} active order${
                        posForGrouping.length === 1 ? "" : "s"
                      } across ${primaryGroups.length} product${
                        primaryGroups.length === 1 ? "" : "s"
                      }`}
                {statusFilter ? ` · ${STATUS_LABELS[statusFilter]}` : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-8 pr-8"
                placeholder="Find POs by number, SKU, or name…"
                value={skuQuery}
                onChange={(e) => setSkuQuery(e.target.value)}
              />
              {skuQuery && (
                <button
                  type="button"
                  onClick={() => setSkuQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label="Clear search"
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
              No purchase orders match “{skuQuery.trim()}”.
            </p>
          ) : primaryGroups.length === 0 ? (
            <p className="text-sm text-stone-500">
              No active purchase orders to show. Use the status filters above to view
              received or cancelled POs.
            </p>
          ) : (
            <div className="space-y-8">
              {primaryGroups.map((group) => (
                <section key={group.key}>
                  <div className="mb-3 border-b border-stone-200 pb-3">
                    <h3 className="text-base font-semibold text-stone-900">
                      {group.label}
                    </h3>
                    {group.skuCode && (
                      <p className="mt-0.5 font-mono text-xs text-stone-500">
                        {group.skuCode}
                        <span className="ml-2 font-sans text-stone-400">
                          · {group.pos.length} PO{group.pos.length === 1 ? "" : "s"}
                        </span>
                      </p>
                    )}
                    {!group.skuCode && (
                      <p className="mt-0.5 text-xs text-stone-500">
                        {group.pos.length} PO{group.pos.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
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
                    <tbody>{renderPoRows(group.pos)}</tbody>
                  </table>
                </section>
              ))}
            </div>
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
            router.push(`/dashboard/procurement/${created.id}`);
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

export default function ProcurementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <ProcurementInner />
    </Suspense>
  );
}
