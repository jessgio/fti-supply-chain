"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import { formatCurrency } from "@/lib/utils";

export type PendingRspChange = {
  skuId: string;
  skuCode: string;
  current: number;
  next: number;
};

export function RspEffectiveDialog({
  pending,
  year,
  currentMonth,
  saving,
  onClose,
  onConfirm,
}: {
  pending: PendingRspChange | null;
  year: number;
  currentMonth: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: (effectiveFrom: string) => void;
}) {
  const defaultMonth =
    year === new Date().getFullYear()
      ? Math.min(12, Math.max(1, currentMonth))
      : 1;
  const [month, setMonth] = useState(defaultMonth);

  if (!pending) return null;

  const effectiveFrom = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change RSP for ${pending.skuCode}`}
      description="Months before this keep the previous RSP. Planned net from this month onward uses the new price. Qty plans are unchanged."
      className="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          {formatCurrency(pending.current)} → {formatCurrency(pending.next)}
        </p>
        <div className="space-y-1">
          <label className="text-sm font-medium text-stone-700">
            Effective from
          </label>
          <Select
            value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}
            disabled={saving}
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {MONTH_LABELS[m - 1]} {year}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(effectiveFrom)}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save RSP"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
