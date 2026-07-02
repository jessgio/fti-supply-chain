"use client";

import { useEffect, useRef, useState } from "react";
import {
  defaultRequiredDocuments,
  SHIPMENT_DOCUMENT_LABELS,
  SHIPMENT_DOCUMENT_TYPES,
  type ShipmentDocumentType,
} from "@/lib/shipments/document-types";
import type { ShipmentType } from "@/types/database";

interface ShipmentDocumentChecklistProps {
  shipmentType: ShipmentType;
  selected: ShipmentDocumentType[];
  onChange: (selected: ShipmentDocumentType[]) => void;
  /** When true, changing shipment type resets defaults. Default true. */
  resetOnTypeChange?: boolean;
}

export function ShipmentDocumentChecklist({
  shipmentType,
  selected,
  onChange,
  resetOnTypeChange = true,
}: ShipmentDocumentChecklistProps) {
  const prevType = useRef(shipmentType);
  const userEdited = useRef(false);

  useEffect(() => {
    if (!resetOnTypeChange) return;
    if (prevType.current !== shipmentType) {
      prevType.current = shipmentType;
      if (!userEdited.current) {
        onChange(defaultRequiredDocuments(shipmentType));
      }
    }
  }, [shipmentType, resetOnTypeChange, onChange]);

  useEffect(() => {
    if (selected.length === 0 && !userEdited.current) {
      onChange(defaultRequiredDocuments(shipmentType));
    }
  }, [selected.length, shipmentType, onChange]);

  function toggle(docType: ShipmentDocumentType) {
    userEdited.current = true;
    onChange(
      selected.includes(docType)
        ? selected.filter((t) => t !== docType)
        : [...selected, docType],
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-stone-700">
        Documentation required
      </p>
      <p className="mb-3 text-xs text-stone-500">
        Defaults are set from shipment type. Tick or untick as needed.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SHIPMENT_DOCUMENT_TYPES.map((docType) => (
          <label
            key={docType}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(docType)}
              onChange={() => toggle(docType)}
            />
            <span>{SHIPMENT_DOCUMENT_LABELS[docType]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
