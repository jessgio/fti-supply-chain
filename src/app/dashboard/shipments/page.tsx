"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plane,
  Plus,
  Search,
  Ship,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/dashboard/page-shell";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { ShipmentHoverLink } from "@/components/procurement/shipment-hover-link";
import { StatusUpdateNotesLink } from "@/components/status-updates/status-update-notes-link";
import { useStatusUpdateCounts } from "@/lib/hooks/use-status-update-counts";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  DEFAULT_TRANSIT_DAYS,
  isShipmentClosed,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_STYLES,
  SHIPMENT_TYPE_LABELS,
  type ShipmentStatus,
  type ShipmentType,
} from "@/lib/shipments/constants";
import { ShipmentDocumentChecklist } from "@/components/shipments/shipment-document-checklist";
import { defaultRequiredDocuments } from "@/lib/shipments/document-types";
import {
  groupShipmentsByPrimaryGood,
  type ShipmentGroupEntry,
} from "@/lib/shipments/shipment-primary-groups";
import { formatNumber, cn } from "@/lib/utils";
import type {
  ProductPackagingLink,
  PurchaseOrder,
  Shipment,
  ShipmentDocumentType,
  ShipmentLineAllocation,
} from "@/types/database";
import type { PoSkuOption } from "@/components/procurement/edit-po-dialog";

const TYPE_ICONS = {
  sea: Ship,
  air: Plane,
  local: Truck,
} as const;

type SortDir = "asc" | "desc";
type ShipmentPageTab = "active" | "historical";

const SHIPMENT_TABS: { id: ShipmentPageTab; label: string }[] = [
  { id: "active", label: "Active shipments" },
  { id: "historical", label: "Historical shipments" },
];

function compareByExpectedDelivery(
  a: ShipmentGroupEntry,
  b: ShipmentGroupEntry,
  dir: SortDir,
): number {
  const cmp = a.shipment.expected_delivery_date.localeCompare(
    b.shipment.expected_delivery_date,
  );
  if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  return a.shipment.shipment_number.localeCompare(b.shipment.shipment_number);
}

function groupDeliverySortKey(
  entries: ShipmentGroupEntry[],
  dir: SortDir,
): string {
  if (entries.length === 0) return dir === "asc" ? "9999-99-99" : "";
  const dates = entries.map((entry) => entry.shipment.expected_delivery_date);
  dates.sort();
  return dir === "asc" ? dates[0]! : dates[dates.length - 1]!;
}

function compareGroupsByExpectedDelivery(
  a: { label: string; entries: ShipmentGroupEntry[] },
  b: { label: string; entries: ShipmentGroupEntry[] },
  dir: SortDir,
): number {
  const cmp = groupDeliverySortKey(a.entries, dir).localeCompare(
    groupDeliverySortKey(b.entries, dir),
  );
  if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

function ScheduleSortHeader({
  sortDir,
  onSort,
}: {
  sortDir: SortDir;
  onSort: () => void;
}) {
  return (
    <th className="py-2 pr-4">
      <button
        type="button"
        className="flex items-center gap-1 whitespace-nowrap text-left font-medium text-stone-500 hover:text-stone-800"
        onClick={onSort}
      >
        Schedule
        <span className="sr-only">
          {sortDir === "asc"
            ? ", sorted soonest delivery first"
            : ", sorted latest delivery first"}
        </span>
        {sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3 shrink-0" />
        ) : (
          <ArrowDown className="h-3 w-3 shrink-0" />
        )}
      </button>
    </th>
  );
}

export default function ShipmentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <ShipmentsInner />
    </Suspense>
  );
}

function ShipmentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightShipmentId = searchParams.get("shipment");
  const returnTo = searchParams.get("returnTo");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [openPos, setOpenPos] = useState<PurchaseOrder[]>([]);
  const [skus, setSkus] = useState<PoSkuOption[]>([]);
  const [packagingLinks, setPackagingLinks] = useState<ProductPackagingLink[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<ShipmentLineAllocation[]>([]);
  const [shipmentType, setShipmentType] = useState<ShipmentType>("sea");
  const [departureDate, setDepartureDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [transitDays, setTransitDays] = useState(DEFAULT_TRANSIT_DAYS.sea);
  const [delayDays, setDelayDays] = useState(0);
  const [shipmentNumber, setShipmentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [requiredDocuments, setRequiredDocuments] = useState<
    ShipmentDocumentType[]
  >(() => defaultRequiredDocuments("sea"));
  const [deliverySortDir, setDeliverySortDir] = useState<SortDir>("asc");
  const [activeTab, setActiveTab] = useState<ShipmentPageTab>("active");

  const activeShipments = useMemo(
    () => shipments.filter((shipment) => !isShipmentClosed(shipment.status)),
    [shipments],
  );
  const historicalShipments = useMemo(
    () => shipments.filter((shipment) => isShipmentClosed(shipment.status)),
    [shipments],
  );
  const visibleShipments =
    activeTab === "historical" ? historicalShipments : activeShipments;

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/shipments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load shipments");
      setShipments(data.shipments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [skuRes, linksRes] = await Promise.all([
          fetch("/api/procurement/skus"),
          fetch("/api/packaging/links"),
        ]);
        const skuData = await skuRes.json();
        const linksData = linksRes.ok ? await linksRes.json() : { links: [] };
        if (!active) return;
        setSkus(skuData.skus ?? []);
        setPackagingLinks(linksData.links ?? []);
      } catch {
        // metadata is optional for browsing
      }
    }
    void loadMeta();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    fetch("/api/procurement/pos")
      .then((r) => r.json())
      .then((data) => {
        const pos = (data.purchaseOrders ?? []).filter(
          (po: PurchaseOrder) =>
            po.status !== "received" && po.status !== "cancelled",
        );
        setOpenPos(pos);
      })
      .catch(() => setOpenPos([]));
  }, [dialogOpen]);

  useEffect(() => {
    if (!selectedPoIds.length) {
      setAllocations([]);
      return;
    }
    const params = new URLSearchParams();
    selectedPoIds.forEach((id) => params.append("po_id", id));
    fetch(`/api/shipments/allocations?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const allocs = (data.allocations ?? []).filter(
          (a: ShipmentLineAllocation) => a.qty_available > 0,
        );
        setAllocations(allocs);
        const qtys: Record<string, number> = {};
        for (const a of allocs) qtys[a.po_line_id] = a.qty_available;
        setLineQtys(qtys);
      })
      .catch(() => setAllocations([]));
  }, [selectedPoIds]);

  useEffect(() => {
    if (!selectedPoIds.length || !departureDate) return;
    const params = new URLSearchParams();
    selectedPoIds.forEach((id) => params.append("po_id", id));
    params.set("shipment_type", shipmentType);
    params.set("departure_date", departureDate);
    fetch(`/api/shipments/suggest-number?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.shipment_number) setShipmentNumber(data.shipment_number);
      })
      .catch(() => {});
  }, [selectedPoIds, shipmentType, departureDate]);

  useEffect(() => {
    setTransitDays(DEFAULT_TRANSIT_DAYS[shipmentType]);
  }, [shipmentType]);

  const groupedBySku = useMemo(() => {
    const groups = groupShipmentsByPrimaryGood(
      visibleShipments,
      skus.map((sku) => ({
        id: sku.id,
        sku_code: sku.sku_code,
        name: sku.name,
        is_packaging: sku.is_packaging ?? false,
        is_bundle: sku.is_bundle ?? false,
      })),
      packagingLinks,
    );

    return [...groups]
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((a, b) =>
          compareByExpectedDelivery(a, b, deliverySortDir),
        ),
      }))
      .sort((a, b) => compareGroupsByExpectedDelivery(a, b, deliverySortDir));
  }, [visibleShipments, skus, packagingLinks, deliverySortDir]);

  const shipmentIds = useMemo(
    () => visibleShipments.map((shipment) => shipment.id),
    [visibleShipments],
  );
  const shipmentPoIds = useMemo(
    () => [
      ...new Set(
        groupedBySku.flatMap((group) =>
          group.entries.map((entry) => entry.po_id),
        ),
      ),
    ],
    [groupedBySku],
  );
  const shipmentNoteCounts = useStatusUpdateCounts("shipment", shipmentIds);
  const poNoteCounts = useStatusUpdateCounts("po", shipmentPoIds);

  useEffect(() => {
    if (highlightShipmentId) {
      const params = new URLSearchParams();
      if (returnTo) params.set("returnTo", returnTo);
      const query = params.toString();
      router.replace(
        `/dashboard/shipments/${highlightShipmentId}${query ? `?${query}` : ""}`,
      );
    }
  }, [highlightShipmentId, returnTo, router]);

  const summary = useMemo(() => {
    return {
      total: activeShipments.length,
      inTransit: activeShipments.filter((s) => s.status === "in_transit").length,
      planned: activeShipments.filter((s) => s.status === "planned").length,
      archived: historicalShipments.length,
    };
  }, [activeShipments, historicalShipments]);

  async function handleCreate() {
    setSaving(true);
    setFormError(null);
    try {
      const items = allocations
        .filter((a) => (lineQtys[a.po_line_id] ?? 0) > 0)
        .map((a) => ({
          po_line_id: a.po_line_id,
          quantity: lineQtys[a.po_line_id],
        }));

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_number: shipmentNumber,
          shipment_type: shipmentType,
          estimated_departure_date: departureDate,
          transit_days: transitDays,
          delay_days: delayDays,
          notes: notes || null,
          po_ids: selectedPoIds,
          items,
          required_documents: requiredDocuments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create shipment");
      setDialogOpen(false);
      setSelectedPoIds([]);
      setNotes("");
      setRequiredDocuments(defaultRequiredDocuments("sea"));
      await loadShipments();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }


  function toggleSelectedPo(poId: string) {
    setSelectedPoIds((prev) =>
      prev.includes(poId) ? prev.filter((id) => id !== poId) : [...prev, poId],
    );
  }

  return (
    <PageShell wide>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Shipments</h1>
          <p className="mt-1 text-sm text-stone-500">
            Log when PO goods depart and track expected delivery dates.
          </p>
        </div>
        {activeTab === "active" && (
          <Button
            onClick={() => {
              setRequiredDocuments(defaultRequiredDocuments(shipmentType));
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New shipment
          </Button>
        )}
      </div>

      {activeTab === "active" ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active shipments</CardDescription>
              <CardTitle className="text-2xl">{summary.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>In transit</CardDescription>
              <CardTitle className="text-2xl">{summary.inTransit}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Planned</CardDescription>
              <CardTitle className="text-2xl">{summary.planned}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : (
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Archived shipments</CardDescription>
              <CardTitle className="text-2xl">{summary.archived}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-stone-200">
        {SHIPMENT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-emerald-700 text-emerald-800"
                : "border-transparent text-stone-500 hover:text-stone-800",
            )}
          >
            {tab.label}
            <span className="ml-2 tabular-nums text-stone-400">
              (
              {tab.id === "active"
                ? summary.total
                : summary.archived}
              )
            </span>
          </button>
        ))}
      </div>

      <Card className={cn(activeTab === "historical" && "border-stone-200 bg-stone-50/40")}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle>
                {activeTab === "historical"
                  ? "Archived shipments by product"
                  : "Shipments by product"}
              </CardTitle>
              <CardDescription>
                {activeTab === "historical"
                  ? "Closed shipments are archived here for reference after inbound is complete."
                  : "Open shipments grouped by product and expected delivery."}
                {" "}
                {visibleShipments.length} shipment
                {visibleShipments.length === 1 ? "" : "s"} across{" "}
                {groupedBySku.length} product
                {groupedBySku.length === 1 ? "" : "s"}
              </CardDescription>
            </div>
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-9"
                placeholder="Search shipment, PO, SKU, supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              className="h-9 w-auto min-w-[12rem] shrink-0"
              value={deliverySortDir}
              onChange={(e) => setDeliverySortDir(e.target.value as SortDir)}
              aria-label="Sort by expected delivery"
            >
              <option value="asc">Delivery: soonest first</option>
              <option value="desc">Delivery: latest first</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-600">{error}</p>
          ) : shipments.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              No shipments yet. Create one to track a PO delivery.
            </p>
          ) : visibleShipments.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              {activeTab === "historical"
                ? "No archived shipments yet. Shipments move here once they are fully received and closed."
                : "No active shipments right now. Closed shipments are kept in Historical shipments."}
            </p>
          ) : groupedBySku.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              No shipments match your search.
            </p>
          ) : (
            <div className="space-y-8">
              {groupedBySku.map((group) => (
                <section
                  key={group.key}
                  className={cn(
                    activeTab === "historical" &&
                      "rounded-lg border border-stone-200 bg-white/70 p-4",
                  )}
                >
                  <div
                    className={cn(
                      "mb-3 border-b border-stone-200 pb-3",
                      activeTab === "historical" && "border-stone-100",
                    )}
                  >
                    <h3
                      className={cn(
                        "text-base font-semibold text-stone-900",
                        activeTab === "historical" && "text-stone-700",
                      )}
                    >
                      {group.label}
                    </h3>
                    {group.skuCode ? (
                      <p className="mt-0.5 font-mono text-xs text-stone-500">
                        {group.skuCode}
                        <span className="ml-2 font-sans text-stone-400">
                          · {group.poCount} PO{group.poCount === 1 ? "" : "s"}
                          {" · "}
                          {group.shipmentCount} shipment
                          {group.shipmentCount === 1 ? "" : "s"}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-stone-500">
                        {group.poCount} PO{group.poCount === 1 ? "" : "s"}
                        {" · "}
                        {group.shipmentCount} shipment
                        {group.shipmentCount === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 text-left">
                          <th className="py-2 pr-4 font-medium text-stone-500">
                            Shipment
                          </th>
                          <th className="py-2 pr-4 font-medium text-stone-500">
                            Type
                          </th>
                          <th className="py-2 pr-4 font-medium text-stone-500">
                            Supplier
                          </th>
                          <ScheduleSortHeader
                            sortDir={deliverySortDir}
                            onSort={() =>
                              setDeliverySortDir((dir) =>
                                dir === "asc" ? "desc" : "asc",
                              )
                            }
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {group.entries.map((entry) => {
                          const { shipment } = entry;
                          const Icon = TYPE_ICONS[shipment.shipment_type];
                          return (
                            <tr
                              key={`${group.key}:${entry.shipment.id}:${entry.po_id}`}
                              className={cn(
                                "cursor-pointer border-b border-stone-100 hover:bg-stone-50/70",
                                activeTab === "historical" &&
                                  "bg-stone-50/50 text-stone-600 hover:bg-stone-100/60",
                              )}
                              onClick={() =>
                                router.push(`/dashboard/shipments/${shipment.id}`)
                              }
                            >
                              <td className="py-2 pr-4">
                                <span
                                  className="inline-flex flex-wrap items-center gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ShipmentHoverLink
                                    shipmentId={shipment.id}
                                    shipmentNumber={shipment.shipment_number}
                                  />
                                  <StatusUpdateNotesLink
                                    entityType="shipment"
                                    entityId={shipment.id}
                                    count={shipmentNoteCounts.get(shipment.id)?.count}
                                  />
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                                  <PoHoverLink
                                    poId={entry.po_id}
                                    poNumber={entry.po_number}
                                  />
                                  <StatusUpdateNotesLink
                                    entityType="po"
                                    entityId={entry.po_id}
                                    count={poNoteCounts.get(entry.po_id)?.count}
                                  />
                                </span>
                              </td>
                              <td className="py-2 pr-4 text-stone-600">
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon className="h-4 w-4" />
                                  {SHIPMENT_TYPE_LABELS[shipment.shipment_type]}
                                </span>
                              </td>
                              <td className="py-2 pr-4 text-stone-600">
                                {entry.supplier_name ?? "—"}
                              </td>
                              <td className="py-2 pr-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-stone-600">
                                    {formatDisplayDate(
                                      shipment.estimated_departure_date,
                                    )}{" "}
                                    →{" "}
                                    {formatDisplayDate(
                                      shipment.expected_delivery_date,
                                    )}
                                  </span>
                                  <Badge
                                    className={
                                      SHIPMENT_STATUS_STYLES[
                                        shipment.status as ShipmentStatus
                                      ]
                                    }
                                  >
                                    {
                                      SHIPMENT_STATUS_LABELS[
                                        shipment.status as ShipmentStatus
                                      ]
                                    }
                                  </Badge>
                                  {activeTab === "historical" && (
                                    <Badge className="bg-stone-200 text-stone-700">
                                      Archived
                                    </Badge>
                                  )}
                                  {activeTab === "active" &&
                                    (shipment.missing_document_count ?? 0) > 0 && (
                                    <Badge className="bg-amber-100 text-amber-800">
                                      {shipment.missing_document_count}{" "}
                                      {shipment.missing_document_count === 1
                                        ? "document"
                                        : "documents"}{" "}
                                      to upload
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="New shipment"
        description="Allocate PO line quantities to this shipment. You can split a PO across multiple shipments."
        className="max-w-2xl"
      >
        <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                Purchase orders
              </label>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-stone-200 p-2">
                {openPos.length === 0 ? (
                  <p className="text-sm text-stone-500">No open POs available.</p>
                ) : (
                  openPos.map((po) => (
                    <label
                      key={po.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-stone-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPoIds.includes(po.id)}
                        onChange={() => toggleSelectedPo(po.id)}
                      />
                      <span className="text-sm">
                        <span className="font-medium text-rose-700">{po.po_number}</span>
                        {po.supplier_name && (
                          <span className="ml-2 text-stone-500">{po.supplier_name}</span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Shipment type
                </label>
                <Select
                  value={shipmentType}
                  onChange={(e) => setShipmentType(e.target.value as ShipmentType)}
                >
                  <option value="sea">Sea</option>
                  <option value="air">Air</option>
                  <option value="local">Local</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Shipment number
                </label>
                <Input
                  value={shipmentNumber}
                  onChange={(e) => setShipmentNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Estimated departure
                </label>
                <Input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Transit days
                </label>
                <Input
                  type="number"
                  min={0}
                  value={transitDays}
                  onChange={(e) => setTransitDays(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Delay days
                </label>
                <Input
                  type="number"
                  min={0}
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value))}
                />
              </div>
            </div>

            {allocations.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Line allocations
                </label>
                <div className="overflow-x-auto rounded-md border border-stone-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-left">
                        <th className="px-3 py-2 font-medium text-stone-500">PO</th>
                        <th className="px-3 py-2 font-medium text-stone-500">SKU</th>
                        <th className="px-3 py-2 font-medium text-stone-500">Available</th>
                        <th className="px-3 py-2 font-medium text-stone-500">Ship qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((a) => (
                        <tr key={a.po_line_id} className="border-b border-stone-100">
                          <td className="px-3 py-2">{a.po_number}</td>
                          <td className="px-3 py-2">{a.sku_code}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatNumber(a.qty_available)}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              max={a.qty_available}
                              className="h-8 w-24"
                              value={lineQtys[a.po_line_id] ?? 0}
                              onChange={(e) =>
                                setLineQtys((prev) => ({
                                  ...prev,
                                  [a.po_line_id]: Number(e.target.value),
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <ShipmentDocumentChecklist
              shipmentType={shipmentType}
              selected={requiredDocuments}
              onChange={setRequiredDocuments}
            />

          {formError && (
            <p className="text-sm text-rose-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !selectedPoIds.length || !allocations.length}
            >
              {saving ? "Creating…" : "Create shipment"}
            </Button>
          </div>
        </div>
      </Dialog>

      <p className="mt-4 text-xs text-stone-500">
        After goods arrive, log an{" "}
        <Link href="/dashboard/inbound" className="text-emerald-700 hover:underline">
          inbound receive
        </Link>{" "}
        to update stock. View the{" "}
        <Link href="/dashboard/po-timeline" className="text-emerald-700 hover:underline">
          PO timeline
        </Link>{" "}
        for production and shipping schedules.
      </p>
    </PageShell>
  );
}
