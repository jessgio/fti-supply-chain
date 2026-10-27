"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_PAYMENT_TERMS,
  ordinalPaymentLabel,
  validatePaymentTerms,
  type PaymentTermDraft,
} from "@/lib/procurement/payment-terms";

export type PaymentTermFormRow = {
  key: string;
  label: string;
  pct: string;
};

let rowKey = 0;

function nextRowKey(): string {
  rowKey += 1;
  return `payment-term-${rowKey}`;
}

export function paymentTermFormFromDrafts(
  terms: PaymentTermDraft[],
): PaymentTermFormRow[] {
  return terms.map((term) => ({
    key: nextRowKey(),
    label: term.label,
    pct: String(term.pct),
  }));
}

export function paymentTermDraftsFromForm(
  rows: PaymentTermFormRow[],
): PaymentTermDraft[] {
  return rows.map((row) => ({
    label: row.label.trim(),
    pct: Number(row.pct),
  }));
}

export function applyDownPaymentPct(
  rows: PaymentTermFormRow[],
  pct: string,
): PaymentTermFormRow[] {
  return rows.map((row, index) => {
    if (index === 0) return { ...row, pct };
    if (rows.length === 2 && index === rows.length - 1) {
      const down = Number(pct);
      if (!Number.isFinite(down)) return row;
      const rest = Math.round((100 - down) * 100) / 100;
      return { ...row, pct: String(rest) };
    }
    return row;
  });
}

export function PaymentTermsFields({
  rows,
  onChange,
}: {
  rows: PaymentTermFormRow[];
  onChange: (rows: PaymentTermFormRow[]) => void;
}) {
  const drafts = paymentTermDraftsFromForm(rows);
  const error = validatePaymentTerms(drafts);

  function update(key: string, patch: Partial<PaymentTermFormRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (rows.length >= MAX_PAYMENT_TERMS) return;
    const next = [...rows];
    const insertAt = Math.max(rows.length - 1, 0);
    next.splice(insertAt, 0, {
      key: nextRowKey(),
      label: ordinalPaymentLabel(insertAt, rows.length + 1),
      pct: "",
    });
    onChange(next);
  }

  function removeRow(key: string) {
    if (rows.length <= 1) return;
    onChange(rows.filter((row) => row.key !== key));
  }

  function putRemainderOnLast() {
    const last = rows[rows.length - 1];
    if (!last) return;
    const prior = drafts.slice(0, -1).reduce((total, term) => {
      return total + (Number.isFinite(term.pct) ? term.pct : 0);
    }, 0);
    const remainder = Math.round((100 - prior) * 100) / 100;
    update(last.key, { pct: String(remainder) });
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-stone-700">Payments</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addRow}
          disabled={rows.length >= MAX_PAYMENT_TERMS}
        >
          <Plus className="h-3.5 w-3.5" />
          Add payment
        </Button>
      </div>
      <p className="text-xs text-stone-500">
        Add a payment when this supplier bills in three or four parts. Percents
        must total 100%.
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-center gap-2">
            <Input
              value={row.label}
              aria-label={`Payment ${index + 1} name`}
              onChange={(e) => update(row.key, { label: e.target.value })}
              placeholder={ordinalPaymentLabel(index, rows.length)}
            />
            <Input
              className="w-24 shrink-0"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={row.pct}
              aria-label={`Payment ${index + 1} percent`}
              onChange={(e) => update(row.key, { pct: e.target.value })}
            />
            <span className="text-sm text-stone-500">%</span>
            <button
              type="button"
              className="rounded-md p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
              aria-label={`Remove ${row.label || `payment ${index + 1}`}`}
              disabled={rows.length <= 1}
              onClick={() => removeRow(row.key)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p className="text-xs text-amber-800">
          {error}{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={putRemainderOnLast}
          >
            Put the remainder on the last payment
          </button>
        </p>
      )}
    </div>
  );
}
