"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileStack, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShipmentHoverLink } from "@/components/procurement/shipment-hover-link";
import { StatusUpdateNotesLink } from "@/components/status-updates/status-update-notes-link";
import { useDashboardReturnPath } from "@/lib/procurement/use-dashboard-return-path";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_STYLES,
  type ShipmentStatus,
} from "@/lib/shipments/constants";
import { ShipmentDocumentsDialog } from "@/components/shipments/shipment-documents-dialog";
import { LogShipmentDialog } from "@/components/shipments/log-shipment-dialog";
import type { PurchaseOrder, Shipment } from "@/types/database";

export function PoShipmentsSection({
  po,
  onChanged,
}: {
  po: PurchaseOrder;
  onChanged: () => void;
}) {
  const returnPath = useDashboardReturnPath();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentsShipment, setDocumentsShipment] = useState<Shipment | null>(
    null,
  );
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch("/api/shipments")
      .then((r) => r.json())
      .then((data) => {
        const all = (data.shipments ?? []) as Shipment[];
        setShipments(
          all
            .filter((s) =>
              (s.purchase_orders ?? []).some((p) => p.id === po.id),
            )
            .sort((a, b) =>
              b.estimated_departure_date.localeCompare(a.estimated_departure_date),
            ),
        );
      })
      .catch(() => setShipments([]));
  }, [po.id, po.updated_at, reloadKey]);

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-stone-500" />
          <p className="text-sm font-medium text-stone-700">Shipments</p>
        </div>
        {po.status !== "received" && po.status !== "cancelled" && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Log shipment
          </Button>
        )}
      </div>

      {shipments.length > 0 ? (
        <div className="space-y-2">
          {shipments.map((shipment) => (
            <div
              key={shipment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-sm"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <ShipmentHoverLink
                    shipmentId={shipment.id}
                    shipmentNumber={shipment.shipment_number}
                    returnTo={returnPath}
                  />
                  <StatusUpdateNotesLink
                    entityType="shipment"
                    entityId={shipment.id}
                  />
                </div>
                <p className="text-xs text-stone-500">
                  Departs {formatDisplayDate(shipment.estimated_departure_date)} ·
                  ETA {formatDisplayDate(shipment.expected_delivery_date)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    SHIPMENT_STATUS_STYLES[shipment.status as ShipmentStatus]
                  }
                >
                  {SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus]}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setDocumentsShipment(shipment);
                    setDocumentsOpen(true);
                  }}
                >
                  <FileStack className="mr-1 h-3.5 w-3.5" />
                  Docs
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-500">No shipments logged for this PO yet.</p>
      )}

      <p className="text-xs text-stone-500">
        After goods depart, record inbound at{" "}
        <Link href="/dashboard/inbound" className="text-emerald-700 hover:underline">
          Inbound Receives
        </Link>
        .
      </p>

      <LogShipmentDialog
        open={dialogOpen}
        po={po}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setReloadKey((key) => key + 1);
          onChanged();
        }}
      />

      <ShipmentDocumentsDialog
        shipment={documentsShipment}
        open={documentsOpen}
        onClose={() => {
          setDocumentsOpen(false);
          setDocumentsShipment(null);
        }}
      />
    </div>
  );
}
