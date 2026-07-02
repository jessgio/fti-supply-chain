"use client";

import { Dialog } from "@/components/ui/dialog";
import { ShipmentDocumentsPanel } from "@/components/shipments/shipment-documents-panel";
import type { Shipment } from "@/types/database";

interface ShipmentDocumentsDialogProps {
  shipment: Shipment | null;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

export function ShipmentDocumentsDialog({
  shipment,
  open,
  onClose,
  readOnly = false,
}: ShipmentDocumentsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={shipment ? `Documents · ${shipment.shipment_number}` : "Documents"}
      description="Manage required documentation and upload versioned files."
      className="max-w-3xl"
    >
      {shipment ? (
        <ShipmentDocumentsPanel shipment={shipment} readOnly={readOnly} />
      ) : null}
    </Dialog>
  );
}
