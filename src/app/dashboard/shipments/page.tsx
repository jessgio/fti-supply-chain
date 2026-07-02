"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
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
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  DEFAULT_TRANSIT_DAYS,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_STYLES,
  SHIPMENT_TYPE_LABELS,
  type ShipmentStatus,
  type ShipmentType,
} from "@/lib/shipments/constants";
import { ShipmentDocumentChecklist } from "@/components/shipments/shipment-document-checklist";
import { defaultRequiredDocuments } from "@/lib/shipments/document-types";
import { formatNumber } from "@/lib/utils";
import type {
  PurchaseOrder,
  Shipment,
  ShipmentDocumentType,
  ShipmentLineAllocation,
} from "@/types/database";

const TYPE_ICONS = {
  sea: Ship,
  air: Plane,
  local: Truck,
} as const;

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
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [openPos, setOpenPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  const groupedByPo = useMemo(() => {
    const map = new Map<
      string,
      {
        po_id: string;
        po_number: string;
        supplier_name: string | null;
        shipments: Shipment[];
      }
    >();

    for (const shipment of shipments) {
      for (const po of shipment.purchase_orders ?? []) {
        const existing = map.get(po.id);
        if (existing) {
          if (!existing.shipments.some((s) => s.id === shipment.id)) {
            existing.shipments.push(shipment);
          }
        } else {
          map.set(po.id, {
            po_id: po.id,
            po_number: po.po_number,
            supplier_name: po.supplier_name ?? null,
            shipments: [shipment],
          });
        }
      }
    }

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        shipments: [...group.shipments].sort((a, b) =>
          b.estimated_departure_date.localeCompare(a.estimated_departure_date),
        ),
      }))
      .sort((a, b) =>
        (b.shipments[0]?.estimated_departure_date ?? "").localeCompare(
          a.shipments[0]?.estimated_departure_date ?? "",
        ),
      );
  }, [shipments]);

  useEffect(() => {
    if (highlightShipmentId) {
      router.replace(`/dashboard/shipments/${highlightShipmentId}`);
    }
  }, [highlightShipmentId, router]);

  function toggleExpandedPo(poId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId);
      else next.add(poId);
      return next;
    });
  }

  const summary = useMemo(() => {
    return {
      total: shipments.length,
      inTransit: shipments.filter((s) => s.status === "in_transit").length,
      planned: shipments.filter((s) => s.status === "planned").length,
    };
  }, [shipments]);

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
        <Button
          onClick={() => {
            setRequiredDocuments(defaultRequiredDocuments(shipmentType));
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New shipment
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total shipments</CardDescription>
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-9"
                placeholder="Search shipment, PO, supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left">
                    <th className="w-8 py-2" />
                    <th className="py-2 pr-4 font-medium text-stone-500">PO</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Supplier</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Shipments</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByPo.map((group) => {
                    const isOpen = expanded.has(group.po_id);
                    return (
                      <Fragment key={group.po_id}>
                        <tr className="border-b border-stone-100 hover:bg-stone-50/50">
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => toggleExpandedPo(group.po_id)}
                              className="flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-100"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-2 pr-4">
                            <PoHoverLink
                              poId={group.po_id}
                              poNumber={group.po_number}
                            />
                          </td>
                          <td className="py-2 pr-4 text-stone-600">
                            {group.supplier_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-stone-600">
                            {group.shipments.length}
                          </td>
                        </tr>
                        {isOpen &&
                          group.shipments.map((shipment) => {
                            const Icon = TYPE_ICONS[shipment.shipment_type];
                            return (
                              <tr
                                key={shipment.id}
                                className="cursor-pointer border-b border-stone-100 bg-stone-50/60 hover:bg-stone-100/70"
                                onClick={() =>
                                  router.push(`/dashboard/shipments/${shipment.id}`)
                                }
                              >
                                <td />
                                <td className="py-2 pr-4 pl-2">
                                  <ShipmentHoverLink
                                    shipmentId={shipment.id}
                                    shipmentNumber={shipment.shipment_number}
                                  />
                                </td>
                                <td className="py-2 pr-4 text-stone-600">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Icon className="h-4 w-4" />
                                    {SHIPMENT_TYPE_LABELS[shipment.shipment_type]}
                                  </span>
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
                                    {(shipment.missing_document_count ?? 0) > 0 && (
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
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
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
