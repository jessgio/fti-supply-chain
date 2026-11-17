"use client";

import { DatePickerPopover } from "@/components/ui/date-picker-popover";
import {
  canLogShipmentFromList,
  procurementListShipment,
  type ShipmentDateField,
} from "@/lib/procurement/po-list-shipments";
import { formatDate } from "@/lib/utils";
import type { PoListShipment, PurchaseOrder } from "@/types/database";

interface PoListDateCellsProps {
  po: PurchaseOrder;
  pendingKeys: ReadonlySet<string>;
  errors: Readonly<Record<string, string>>;
  onExpectedDate: (date: string | null) => void;
  onShipmentDate: (
    shipment: PoListShipment,
    field: ShipmentDateField,
    date: string,
  ) => void;
  onCreateShipment: () => void;
}

function DateError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 max-w-[11rem] text-xs text-red-600">
      {message}
    </p>
  );
}

function ReadOnlyDate({
  value,
  title,
}: {
  value: string | null | undefined;
  title?: string;
}) {
  return (
    <span className="text-sm text-stone-700" title={title}>
      {formatDate(value)}
    </span>
  );
}

export function PoListDateCells({
  po,
  pendingKeys,
  errors,
  onExpectedDate,
  onShipmentDate,
  onCreateShipment,
}: PoListDateCellsProps) {
  const expectedKey = `${po.id}:expected`;
  const shipment = procurementListShipment(po.shipments);
  const extraShipments = Math.max(0, (po.shipments?.length ?? 0) - (shipment ? 1 : 0));
  const locked = po.status === "cancelled";
  const canCreate = canLogShipmentFromList(po);
  const shipmentEditable = shipment != null && shipment.status !== "closed";
  const startKey = shipment ? `${shipment.id}:start` : "";
  const endKey = shipment ? `${shipment.id}:end` : "";
  const otherShipments = (po.shipments ?? []).filter((row) => row.id !== shipment?.id);
  const shipmentTitle =
    shipment == null
      ? undefined
      : otherShipments.length === 0
        ? shipment.shipment_number
        : [
            `${shipment.shipment_number} is the next open shipment.`,
            ...otherShipments.map(
              (row) =>
                `${row.shipment_number}: ${formatDate(row.estimated_departure_date)} – ${formatDate(row.expected_delivery_date)}`,
            ),
          ].join(" ");

  return (
    <>
      <td className="py-2 pr-4 align-top">
        {locked ? (
          <ReadOnlyDate
            value={po.expected_date}
            title="Cancelled purchase orders can only have notes updated."
          />
        ) : (
          <DatePickerPopover
            value={po.expected_date}
            onChange={onExpectedDate}
            ariaLabel={`Expected date for ${po.po_number}`}
            clearable
            pending={pendingKeys.has(expectedKey)}
            invalid={Boolean(errors[expectedKey])}
            describedBy={errors[expectedKey] ? expectedKey : undefined}
          />
        )}
        <DateError id={expectedKey} message={errors[expectedKey]} />
      </td>
      <td className="py-2 pr-4 align-top" title={shipmentTitle}>
        {shipment && shipmentEditable ? (
          <DatePickerPopover
            value={shipment.estimated_departure_date}
            onChange={(date) => {
              if (date) onShipmentDate(shipment, "start", date);
            }}
            ariaLabel={`Ship start for ${po.po_number}, ${shipment.shipment_number}`}
            pending={pendingKeys.has(startKey)}
            invalid={Boolean(errors[startKey])}
            describedBy={errors[startKey] ? startKey : undefined}
          />
        ) : shipment ? (
          <ReadOnlyDate
            value={shipment.estimated_departure_date}
            title="Closed shipments can't be edited."
          />
        ) : canCreate ? (
          <button
            type="button"
            className="text-sm font-medium text-emerald-700 hover:underline"
            aria-label={`Create shipment for ${po.po_number}`}
            onClick={(event) => {
              event.stopPropagation();
              onCreateShipment();
            }}
          >
            Add
          </button>
        ) : (
          <ReadOnlyDate value={null} />
        )}
        {shipment ? (
          <p className="mt-0.5 text-[11px] text-stone-400">
            {shipment.shipment_number}
            {extraShipments > 0 ? ` · +${extraShipments}` : ""}
          </p>
        ) : null}
        <DateError id={startKey} message={startKey ? errors[startKey] : undefined} />
      </td>
      <td className="py-2 pr-4 align-top">
        {shipment && shipmentEditable ? (
          <DatePickerPopover
            value={shipment.expected_delivery_date}
            onChange={(date) => {
              if (date) onShipmentDate(shipment, "end", date);
            }}
            ariaLabel={`Ship end for ${po.po_number}, ${shipment.shipment_number}`}
            pending={pendingKeys.has(endKey)}
            invalid={Boolean(errors[endKey])}
            describedBy={errors[endKey] ? endKey : undefined}
          />
        ) : shipment ? (
          <ReadOnlyDate
            value={shipment.expected_delivery_date}
            title="Closed shipments can't be edited."
          />
        ) : canCreate ? (
          <button
            type="button"
            className="text-sm font-medium text-emerald-700 hover:underline"
            aria-label={`Create shipment for ${po.po_number}`}
            onClick={(event) => {
              event.stopPropagation();
              onCreateShipment();
            }}
          >
            Add
          </button>
        ) : (
          <ReadOnlyDate value={null} />
        )}
        <DateError id={endKey} message={endKey ? errors[endKey] : undefined} />
      </td>
    </>
  );
}
