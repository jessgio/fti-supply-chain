"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers, ShoppingCart, Link2, Trash2 } from "lucide-react";
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
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/dashboard/page-shell";
import { formatNumber } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { DEFAULT_TARGET_STOCK_MONTHS } from "@/lib/forecast/demand";
import { PACKAGING_STOCK_LOCATION, STOCK_QTY_COLUMN } from "@/lib/stock/locations";
import type {
  PackagingPoLine,
  PackagingSkuRow,
  PoStatus,
  ProductPackagingLink,
} from "@/types/database";

interface FinishedGoodOption {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_name: string | null;
}

interface SkuToggleRow {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  franchise_name: string | null;
}

type PackagingFilter = "all" | "packaging" | "other";

const PO_STATUS_LABELS: Record<PoStatus, string> = {
  planned: "Planned",
  ordered: "Ordered",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

const PO_STATUS_STYLES: Record<PoStatus, string> = {
  planned: "bg-stone-100 text-stone-700",
  ordered: "bg-sky-100 text-sky-800",
  in_transit: "bg-amber-100 text-amber-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function PackagingPage() {
  const [items, setItems] = useState<PackagingSkuRow[]>([]);
  const [openPoLines, setOpenPoLines] = useState<PackagingPoLine[]>([]);
  const [stockAsOf, setStockAsOf] = useState<string | null>(null);
  const [toggleSkus, setToggleSkus] = useState<SkuToggleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [packagingFilter, setPackagingFilter] =
    useState<PackagingFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [links, setLinks] = useState<ProductPackagingLink[]>([]);
  const [products, setProducts] = useState<FinishedGoodOption[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [linkPackagingId, setLinkPackagingId] = useState("");
  const [linkProductId, setLinkProductId] = useState("");
  const [linkQty, setLinkQty] = useState("1");
  const [linkSaving, setLinkSaving] = useState(false);
  const [expandedPackagingId, setExpandedPackagingId] = useState<string | null>(
    null,
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/packaging");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load packaging");
      setItems(data.items ?? []);
      setOpenPoLines(data.openPoLines ?? []);
      setStockAsOf(data.stockAsOf ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadToggleSkus = useCallback(async () => {
    setToggleLoading(true);
    try {
      const res = await fetch("/api/packaging/skus");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load SKUs");
      setToggleSkus(data.skus ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SKUs");
    } finally {
      setToggleLoading(false);
    }
  }, []);

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      const [linksRes, productsRes] = await Promise.all([
        fetch("/api/packaging/links"),
        fetch("/api/packaging/products"),
      ]);
      const linksData = await linksRes.json();
      const productsData = await productsRes.json();
      if (!linksRes.ok) throw new Error(linksData.error ?? "Failed to load links");
      if (!productsRes.ok) {
        throw new Error(productsData.error ?? "Failed to load products");
      }
      setLinks(linksData.links ?? []);
      setProducts(productsData.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load links");
    } finally {
      setLinksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadToggleSkus();
    loadLinks();
  }, [loadOverview, loadToggleSkus, loadLinks]);

  const summary = useMemo(() => {
    const totalOnHand = items.reduce((sum, row) => sum + row.qty_on_hand, 0);
    const totalOnOrder = items.reduce((sum, row) => sum + row.on_order_qty, 0);
    const lowStock = items.filter(
      (row) => row.qty_on_hand + row.on_order_qty <= 0,
    ).length;
    return {
      skuCount: items.length,
      totalOnHand,
      totalOnOrder,
      openPoLineCount: openPoLines.length,
      lowStock,
    };
  }, [items, openPoLines]);

  const filteredToggleSkus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return toggleSkus.filter((sku) => {
      if (packagingFilter === "packaging" && !sku.is_packaging) return false;
      if (packagingFilter === "other" && sku.is_packaging) return false;
      if (!q) return true;
      return (
        sku.sku_code.toLowerCase().includes(q) ||
        (sku.name?.toLowerCase().includes(q) ?? false) ||
        (sku.franchise_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [toggleSkus, search, packagingFilter]);

  const packagingCount = toggleSkus.filter((s) => s.is_packaging).length;

  async function togglePackaging(sku: SkuToggleRow) {
    if (sku.is_bundle) return;
    setUpdatingId(sku.id);
    try {
      const res = await fetch(`/api/skus/${sku.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_packaging: !sku.is_packaging }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setToggleSkus((prev) =>
        prev.map((row) =>
          row.id === sku.id
            ? { ...row, is_packaging: !row.is_packaging }
            : row,
        ),
      );
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  function refreshAll() {
    loadOverview();
    loadToggleSkus();
    loadLinks();
  }

  async function addLink() {
    if (!linkPackagingId || !linkProductId) return;
    const qty = Number(linkQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity per unit must be greater than zero.");
      return;
    }
    setLinkSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/packaging/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packaging_sku_id: linkPackagingId,
          product_sku_id: linkProductId,
          qty_per_unit: qty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add link");
      setLinkProductId("");
      setLinkQty("1");
      await Promise.all([loadLinks(), loadOverview()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add link");
    } finally {
      setLinkSaving(false);
    }
  }

  async function removeLink(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/packaging/links/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove link");
      await Promise.all([loadLinks(), loadOverview()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove link");
    }
  }

  return (
    <PageShell wide>
      <div>
        <div className="flex items-center gap-2">
          <Layers className="h-6 w-6 text-emerald-800" />
          <h1 className="text-2xl font-semibold text-stone-900">
            Packaging materials
          </h1>
        </div>
        <p className="mt-1 max-w-3xl text-stone-600">
          Track primary packaging inventory (UB, EFLUTE, JAR, PUMP, etc.) and
          purchase orders before components go to the manufacturer. On-hand stock
          comes from {PACKAGING_STOCK_LOCATION} ({STOCK_QTY_COLUMN} column in the
          WMS upload); POs are managed in Procurement.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Packaging SKUs"
          value={formatNumber(summary.skuCount)}
          hint={
            packagingCount > summary.skuCount
              ? `${packagingCount} marked total`
              : "Marked as packaging"
          }
        />
        <StatCard
          label="On hand"
          value={formatNumber(summary.totalOnHand)}
          hint={
            stockAsOf
              ? `${PACKAGING_STOCK_LOCATION} · ${stockAsOf}`
              : `Upload WMS stock for ${PACKAGING_STOCK_LOCATION}`
          }
        />
        <StatCard
          label="On order"
          value={formatNumber(summary.totalOnOrder)}
          hint="Ordered or in transit POs"
        />
        <StatCard
          label="Open PO lines"
          value={formatNumber(summary.openPoLineCount)}
          hint={
            summary.lowStock > 0
              ? `${summary.lowStock} SKU${summary.lowStock === 1 ? "" : "s"} with no stock or orders`
              : "Planned, ordered, or in transit"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link packaging to finished goods
          </CardTitle>
          <CardDescription>
            Connect each packaging SKU to the finished goods it is used for, with
            units per finished good. Suggested PO quantities are derived from
            linked products that need a restock batch (
            {DEFAULT_TARGET_STOCK_MONTHS}-month cover in Inventory).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">
                Packaging SKU
              </span>
              <Select
                value={linkPackagingId}
                onChange={(e) => setLinkPackagingId(e.target.value)}
              >
                <option value="">Select packaging</option>
                {items.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.sku_code}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-stone-700">
                Finished good
              </span>
              <Select
                value={linkProductId}
                onChange={(e) => setLinkProductId(e.target.value)}
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku_code}
                    {p.franchise_name ? ` · ${p.franchise_name}` : ""}
                    {p.name ? ` · ${p.name}` : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">
                Qty per unit
              </span>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={linkQty}
                  onChange={(e) => setLinkQty(e.target.value)}
                />
                <Button
                  onClick={addLink}
                  disabled={linkSaving || !linkPackagingId || !linkProductId}
                >
                  {linkSaving ? "Adding…" : "Add"}
                </Button>
              </div>
            </label>
          </div>

          {linksLoading ? (
            <p className="text-sm text-stone-500">Loading links…</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-stone-500">
              No links yet. Add connections above so packaging PO quantities
              reflect upcoming finished-goods restocks.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">Packaging</th>
                    <th className="px-3 py-2">Finished good</th>
                    <th className="px-3 py-2 text-right">Qty / unit</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr
                      key={link.id}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {link.packaging_sku_code}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {link.product_sku_code}
                        {link.product_name && (
                          <span className="block text-stone-500">
                            {link.product_name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(link.qty_per_unit)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeLink(link.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
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
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Packaging inventory</CardTitle>
            <CardDescription>
              On-hand from {PACKAGING_STOCK_LOCATION} (WMS {STOCK_QTY_COLUMN})
              plus units on open POs. Suggested PO qty covers linked finished
              goods that need a restock, minus packaging already on hand or on
              order.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={refreshAll}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-stone-500">Loading inventory…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-stone-500">
              No packaging SKUs yet. Mark materials like UB, EFLUTE, JAR, or
              PUMP in the section below.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 text-right">On hand</th>
                    <th className="px-3 py-2 text-right">On order</th>
                    <th className="px-3 py-2 text-right">From FG restock</th>
                    <th className="px-3 py-2 text-right">Suggested PO</th>
                    <th className="px-3 py-2 text-right">Total available</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const total = row.qty_on_hand + row.on_order_qty;
                    const hasLinks = row.linked_products.length > 0;
                    const expanded = expandedPackagingId === row.id;
                    const poQty =
                      row.recommended_po_qty > 0 ? row.recommended_po_qty : 0;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-stone-100">
                          <td className="px-3 py-2 font-mono text-xs sm:text-sm">
                            {hasLinks ? (
                              <button
                                type="button"
                                className="text-left hover:underline"
                                onClick={() =>
                                  setExpandedPackagingId(
                                    expanded ? null : row.id,
                                  )
                                }
                              >
                                {row.sku_code}
                                <span className="ml-1 text-xs text-stone-400">
                                  ({row.linked_products.length} linked)
                                </span>
                              </button>
                            ) : (
                              row.sku_code
                            )}
                          </td>
                          <td className="px-3 py-2">{row.name ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatNumber(row.qty_on_hand)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatNumber(row.on_order_qty)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-stone-700">
                            {hasLinks
                              ? formatNumber(row.suggested_from_fg_restock)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-800">
                            {hasLinks && poQty > 0
                              ? formatNumber(poQty)
                              : hasLinks
                                ? "—"
                                : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatNumber(total)}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/dashboard/procurement?sku=${encodeURIComponent(row.sku_code)}${poQty > 0 ? `&qty=${poQty}` : ""}`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800 hover:underline"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              Create PO
                            </Link>
                          </td>
                        </tr>
                        {expanded && hasLinks && (
                          <tr
                            key={`${row.id}-detail`}
                            className="border-b border-stone-100 bg-stone-50"
                          >
                            <td colSpan={8} className="px-3 py-3">
                              <p className="mb-2 text-xs font-medium text-stone-600">
                                Linked finished goods (restock batch × qty per
                                unit)
                              </p>
                              <ul className="space-y-1 text-sm text-stone-700">
                                {row.linked_products.map((link) => (
                                  <li
                                    key={link.product_sku_code}
                                    className="flex flex-wrap justify-between gap-2"
                                  >
                                    <span className="font-mono text-xs">
                                      {link.product_sku_code}
                                      {link.product_name
                                        ? ` · ${link.product_name}`
                                        : ""}
                                    </span>
                                    <span className="tabular-nums text-stone-600">
                                      {link.fg_restock_qty != null
                                        ? `${formatNumber(link.fg_restock_qty)} × ${formatNumber(link.qty_per_unit)} = ${formatNumber(link.contribution)}`
                                        : `${formatNumber(link.qty_per_unit)} / unit · no FG restock due`}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open purchase orders</CardTitle>
          <CardDescription>
            PO lines for packaging SKUs that are planned, ordered, or in
            transit. Full PO management is in Procurement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-stone-500">Loading POs…</p>
          ) : openPoLines.length === 0 ? (
            <p className="text-sm text-stone-500">
              No open PO lines for packaging SKUs.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">PO</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Expected</th>
                    <th className="px-3 py-2 text-right">Open qty</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                  </tr>
                </thead>
                <tbody>
                  {openPoLines.map((line, idx) => (
                    <tr
                      key={`${line.po_id}-${line.sku_code}-${idx}`}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link
                          href="/dashboard/procurement"
                          className="text-emerald-800 hover:underline"
                        >
                          {line.po_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {line.sku_code}
                      </td>
                      <td className="px-3 py-2">
                        {line.supplier_name ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={PO_STATUS_STYLES[line.po_status]}>
                          {PO_STATUS_LABELS[line.po_status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{line.expected_date ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatNumber(line.qty_open)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-500">
                        {formatNumber(line.qty_received)} /{" "}
                        {formatNumber(line.qty_ordered)}
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
          <CardTitle>Mark packaging SKUs</CardTitle>
          <CardDescription>
            Flag primary packaging materials (UB, EFLUTE, JAR, PUMP, etc.). Like
            active/inactive status, this is not reset when you re-upload
            mappings or stock. Bundle parent SKUs cannot be marked as packaging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search SKU or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex gap-2">
              {(
                [
                  ["all", "All"],
                  ["packaging", "Packaging"],
                  ["other", "Other"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={packagingFilter === id ? "default" : "outline"}
                  onClick={() => setPackagingFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {packagingCount > 0 && (
            <p className="text-sm text-stone-600">
              {packagingCount} SKU{packagingCount === 1 ? "" : "s"} marked as
              packaging.
            </p>
          )}

          {toggleLoading ? (
            <p className="text-sm text-stone-500">Loading SKUs…</p>
          ) : filteredToggleSkus.length === 0 ? (
            <p className="text-sm text-stone-500">No SKUs match your filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Franchise</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Packaging</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredToggleSkus.map((sku) => (
                    <tr
                      key={sku.id}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs sm:text-sm">
                        {sku.sku_code}
                      </td>
                      <td className="px-3 py-2">{sku.name ?? "—"}</td>
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
                        ) : sku.is_packaging ? (
                          <Badge className="bg-violet-100 text-violet-800">
                            Packaging
                          </Badge>
                        ) : (
                          <Badge className="bg-stone-100 text-stone-600">
                            Product
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
                            onClick={() => togglePackaging(sku)}
                          >
                            {updatingId === sku.id
                              ? "Saving…"
                              : sku.is_packaging
                                ? "Unmark packaging"
                                : "Mark packaging"}
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
    </PageShell>
  );
}
