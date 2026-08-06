"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/lib/shipments/shipment-dates";
import { summarizeSkuLabels } from "@/lib/procurement/sku-labels";
import type { Shipment } from "@/types/database";

interface ShipmentSelectInputProps {
  options: Shipment[];
  value: string;
  onChange: (shipmentId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function shipmentTitle(shipment: Shipment): string {
  const poNumbers = (shipment.purchase_orders ?? [])
    .map((po) => po.po_number)
    .filter(Boolean);
  const poLabel = poNumbers.length > 0 ? ` · ${poNumbers.join(", ")}` : "";
  return `${shipment.shipment_number}${poLabel} — delivery ${formatDisplayDate(shipment.expected_delivery_date)}`;
}

function shipmentSkuSummary(shipment: Shipment): string {
  return summarizeSkuLabels(
    (shipment.purchase_orders ?? []).flatMap((po) => po.items ?? []),
  );
}

function matchesShipment(shipment: Shipment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (shipment.shipment_number.toLowerCase().includes(q)) return true;
  if (
    (shipment.purchase_orders ?? []).some((po) =>
      po.po_number.toLowerCase().includes(q),
    )
  ) {
    return true;
  }
  return (shipment.purchase_orders ?? [])
    .flatMap((po) => po.items ?? [])
    .some(
      (item) =>
        item.sku_code.toLowerCase().includes(q) ||
        (item.sku_name ?? "").toLowerCase().includes(q),
    );
}

export function ShipmentSelectInput({
  options,
  value,
  onChange,
  placeholder = "Select a shipment…",
  disabled = false,
  className,
}: ShipmentSelectInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((s) => s.id === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const results = useMemo(
    () => options.filter((s) => matchesShipment(s, query)),
    [options, query],
  );

  useEffect(() => {
    setHighlight(0);
  }, [results]);

  function selectShipment(shipment: Shipment) {
    onChange(shipment.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "flex min-h-10 w-full items-start justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-emerald-600 ring-1 ring-emerald-600",
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          if (!open) setQuery("");
        }}
      >
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block whitespace-normal break-words font-medium leading-snug">
              {shipmentTitle(selected)}
            </span>
            {shipmentSkuSummary(selected) && (
              <span className="mt-0.5 block whitespace-normal break-words text-xs italic leading-snug text-stone-500">
                {shipmentSkuSummary(selected)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-stone-500">{placeholder}</span>
        )}
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-stone-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-100 p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by shipment, PO, or SKU…"
              className="w-full rounded-md border border-stone-200 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) =>
                    Math.min(h + 1, Math.max(results.length - 1, 0)),
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter" && results[highlight]) {
                  e.preventDefault();
                  selectShipment(results[highlight]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                  setQuery("");
                }
              }}
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-72 overflow-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-stone-500">
                No matching shipments.
              </li>
            ) : (
              results.map((shipment, idx) => {
                const skus = shipmentSkuSummary(shipment);
                return (
                  <li
                    key={shipment.id}
                    role="option"
                    aria-selected={shipment.id === value}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col px-3 py-2 text-left hover:bg-stone-50",
                        idx === highlight && "bg-stone-50",
                        shipment.id === value && "bg-emerald-50",
                      )}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => selectShipment(shipment)}
                    >
                      <span className="whitespace-normal break-words text-sm font-medium leading-snug text-stone-900">
                        {shipmentTitle(shipment)}
                      </span>
                      {skus ? (
                        <span className="mt-0.5 whitespace-normal break-words text-xs italic leading-snug text-stone-500">
                          {skus}
                        </span>
                      ) : (
                        <span className="mt-0.5 text-xs italic text-stone-400">
                          No line items
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
