"use client";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import type { PoShortfallResolution } from "@/types/database";
import type { ShortShipLine } from "@/lib/shipments/short-ship";

export type ShortShipWizardStep = "form" | "close_ship" | "po_resolution";

type ShortShipWizardPanelProps = {
  step: Exclude<ShortShipWizardStep, "form">;
  shortLines: ShortShipLine[];
  saving: boolean;
  onLeaveOpen: () => void;
  onChooseClose: () => void;
  onResolve: (resolution: PoShortfallResolution) => void;
  onBack: () => void;
};

export function shortShipDialogTitle(step: ShortShipWizardStep): string | null {
  if (step === "close_ship") return "Shipping less than remaining PO qty";
  if (step === "po_resolution") return "Resolve purchase order quantity";
  return null;
}

export function shortShipDialogDescription(
  step: ShortShipWizardStep,
): string | null {
  if (step === "close_ship") {
    return "You can leave the remainder open for another shipment, or finalize the shortfall on the purchase order.";
  }
  if (step === "po_resolution") {
    return "Choose how to handle the unshipped remainder on the original purchase order.";
  }
  return null;
}

export function ShortShipWizardPanel({
  step,
  shortLines,
  saving,
  onLeaveOpen,
  onChooseClose,
  onResolve,
  onBack,
}: ShortShipWizardPanelProps) {
  return (
    <div className="space-y-4">
      {step === "close_ship" && (
        <>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
            <p className="font-medium">Quantities are under remaining PO</p>
            <ul className="mt-2 space-y-1 text-xs">
              {shortLines.map((line) => (
                <li key={line.po_line_id}>
                  {line.sku_code}: shipping {formatNumber(line.shipQty)} of{" "}
                  {formatNumber(line.available)} available (−
                  {formatNumber(line.shortBy)})
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-stone-600">
            Leave open if another shipment will cover the remainder. Closing means
            you will not ship the leftover quantity on these lines.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onLeaveOpen}
            >
              {saving ? "Saving…" : "Leave open for further shipment"}
            </Button>
            <Button type="button" disabled={saving} onClick={onChooseClose}>
              Finalize shortfall
            </Button>
          </div>
        </>
      )}

      {step === "po_resolution" && (
        <>
          <p className="text-sm text-stone-600">
            Finalize this short shipment. Choose how to update the purchase order:
          </p>
          <div className="grid gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => onResolve("leave_as_is")}
              className="rounded-lg border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
            >
              <span className="block text-sm font-medium text-stone-900">
                Leave PO quantity as-is
              </span>
              <span className="mt-1 block text-xs text-stone-500">
                Keep ordered quantities. After this shipment is fully inbound, the
                PO lines are marked short received and closed.
              </span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onResolve("adjust_ordered")}
              className="rounded-lg border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
            >
              <span className="block text-sm font-medium text-stone-900">
                Change PO quantity to match shipped
              </span>
              <span className="mt-1 block text-xs text-stone-500">
                Lower ordered quantities to the total shipped after this save. A
                full inbound of this shipment can then complete the order.
              </span>
            </button>
          </div>
        </>
      )}

      <div className="flex justify-end border-t border-stone-200 pt-4">
        <Button variant="outline" disabled={saving} onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
