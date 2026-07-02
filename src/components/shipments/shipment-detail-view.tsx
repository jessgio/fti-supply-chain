"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plane,
  Ship,
  Trash2,
  Truck,
} from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { ShipmentDocumentsPanel } from "@/components/shipments/shipment-documents-panel";
import { ShipmentEditDialog } from "@/components/shipments/shipment-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_STYLES,
  SHIPMENT_TYPE_LABELS,
  type ShipmentStatus,
  type ShipmentType,
} from "@/lib/shipments/constants";
import { formatNumber } from "@/lib/utils";
import type { Shipment } from "@/types/database";

const TYPE_ICONS = {
  sea: Ship,
  air: Plane,
  local: Truck,
} as const;

interface ShipmentDetailViewProps {
  shipmentId: string;
  backHref?: string;
  backLabel?: string;
}

export function ShipmentDetailView({
  shipmentId,
  backHref = "/dashboard/shipments",
  backLabel = "Back to shipments",
}: ShipmentDetailViewProps) {
  const router = useRouter();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const loadShipment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load shipment");
      setShipment(data.shipment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadShipment();
  }, [loadShipment]);

  async function handleDelete() {
    if (!shipment || !confirm("Delete this shipment?")) return;
    const res = await fetch(`/api/shipments/${shipment.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to delete");
      return;
    }
    router.push(backHref);
  }

  if (loading) {
    return (
      <PageShell wide>
        <p className="py-12 text-center text-sm text-stone-500">Loading shipment…</p>
      </PageShell>
    );
  }

  if (error || !shipment) {
    return (
      <PageShell wide>
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <p className="py-12 text-center text-sm text-rose-600">
          {error ?? "Shipment not found."}
        </p>
      </PageShell>
    );
  }

  const Icon = TYPE_ICONS[shipment.shipment_type];
  const isClosed = shipment.status === "closed";
  const lineItems = (shipment.purchase_orders ?? []).flatMap((po) =>
    (po.items ?? []).map((item) => ({
      ...item,
      po_id: po.id,
      po_number: po.po_number,
      supplier_name: po.supplier_name,
    })),
  );

  return (
    <PageShell wide>
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-stone-900">
              {shipment.shipment_number}
            </h1>
            <Badge className={SHIPMENT_STATUS_STYLES[shipment.status as ShipmentStatus]}>
              {SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus]}
            </Badge>
          </div>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-stone-500">
            <Icon className="h-4 w-4" />
            {SHIPMENT_TYPE_LABELS[shipment.shipment_type as ShipmentType]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isClosed && (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                className="text-rose-700 hover:text-rose-800"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shipment details</CardTitle>
            <CardDescription>Dates, transit, and notes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow
              label="Estimated departure"
              value={formatDisplayDate(shipment.estimated_departure_date)}
            />
            <DetailRow
              label="Expected delivery"
              value={formatDisplayDate(shipment.expected_delivery_date)}
            />
            <DetailRow label="Transit days" value={String(shipment.transit_days)} />
            <DetailRow label="Delay days" value={String(shipment.delay_days)} />
            <DetailRow label="Notes" value={shipment.notes?.trim() || "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Purchase orders</CardTitle>
            <CardDescription>Linked POs for this shipment</CardDescription>
          </CardHeader>
          <CardContent>
            {(shipment.purchase_orders ?? []).length === 0 ? (
              <p className="text-sm text-stone-500">No purchase orders linked.</p>
            ) : (
              <ul className="space-y-2">
                {(shipment.purchase_orders ?? []).map((po) => (
                  <li key={po.id} className="text-sm">
                    <PoHoverLink poId={po.id} poNumber={po.po_number} />
                    {po.supplier_name && (
                      <span className="ml-2 text-stone-500">{po.supplier_name}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Line allocations</CardTitle>
          <CardDescription>Quantities shipped per PO line</CardDescription>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <p className="text-sm text-stone-500">No line items allocated.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left">
                    <th className="py-2 pr-4 font-medium text-stone-500">PO</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">SKU</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Name</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Ship qty</th>
                    <th className="py-2 pr-4 font-medium text-stone-500">Ordered</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-b border-stone-100">
                      <td className="py-2 pr-4">{item.po_number}</td>
                      <td className="py-2 pr-4 font-medium">{item.sku_code}</td>
                      <td className="py-2 pr-4 text-stone-600">{item.sku_name ?? "—"}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatNumber(item.quantity)}</td>
                      <td className="py-2 pr-4 tabular-nums text-stone-500">
                        {formatNumber(item.qty_ordered)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Required checklist, uploads, previews, and version history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShipmentDocumentsPanel shipment={shipment} readOnly={isClosed} />
        </CardContent>
      </Card>

      <ShipmentEditDialog
        shipmentId={shipment.id}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={loadShipment}
      />
    </PageShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-stone-500">{label}</span>
      <span className="text-right font-medium text-stone-900">{value}</span>
    </div>
  );
}
