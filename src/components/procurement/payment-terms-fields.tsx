"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPoMoney, preserveFractionalMoney } from "@/lib/procurement/currencies";
import {
  allocatePaymentTerms,
  MAX_PAYMENT_TERMS,
  ordinalPaymentLabel,
  paymentTermBasis,
  validatePaymentTerms,
  type PaymentTermBasis,
  type PaymentTermDraft,
} from "@/lib/procurement/payment-terms";

export type PaymentTermFormRow = {
  key: string;
  label: string;
  pct: string;
  basis: PaymentTermBasis;
  amount: string;
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
    basis: paymentTermBasis(term),
    pct: Number.isFinite(term.pct) ? String(term.pct) : "",
    amount:
      paymentTermBasis(term) === "amount" && term.amount != null
        ? String(term.amount)
        : "",
  }));
}

export function paymentTermDraftsFromForm(
  rows: PaymentTermFormRow[],
): PaymentTermDraft[] {
  return rows.map((row) => {
    if (row.basis === "amount") {
      return {
        label: row.label.trim(),
        basis: "amount" as const,
        amount: row.amount.trim() === "" ? Number.NaN : Number(row.amount),
        pct: Number(row.pct) || 0,
      };
    }
    return {
      label: row.label.trim(),
      basis: "pct" as const,
      pct: row.pct.trim() === "" ? Number.NaN : Number(row.pct),
    };
  });
}

export function applyDownPaymentPct(
  rows: PaymentTermFormRow[],
  pct: string,
): PaymentTermFormRow[] {
  return rows.map((row, index) => {
    if (index === 0) return { ...row, basis: "pct", pct, amount: "" };
    if (rows.length === 2 && index === rows.length - 1) {
      const down = Number(pct);
      if (!Number.isFinite(down)) return { ...row, basis: "pct", amount: "" };
      const rest = Math.round((100 - down) * 100) / 100;
      return { ...row, basis: "pct", pct: String(rest), amount: "" };
    }
    return row;
  });
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

export function PaymentTermsFields({
  rows,
  onChange,
  invoiceTotal,
  currency = "IDR",
}: {
  rows: PaymentTermFormRow[];
  onChange: (rows: PaymentTermFormRow[]) => void;
  invoiceTotal?: number;
  currency?: string;
}) {
  const drafts = paymentTermDraftsFromForm(rows);
  const check =
    invoiceTotal != null && Number.isFinite(invoiceTotal)
      ? { invoiceTotal, currency }
      : undefined;
  const error = validatePaymentTerms(drafts, check);
  const hasAmount = rows.some((row) => row.basis === "amount");
  const allocated =
    invoiceTotal != null && Number.isFinite(invoiceTotal)
      ? allocatePaymentTerms(invoiceTotal, drafts)
      : null;
  const plugIndex = allocated?.findIndex((term) => term.remainder) ?? -1;

  function update(key: string, patch: Partial<PaymentTermFormRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function setBasis(row: PaymentTermFormRow, basis: PaymentTermBasis) {
    if (basis === row.basis) return;
    const invoice = invoiceTotal ?? 0;
    if (basis === "amount") {
      const pct = Number(row.pct);
      const seeded =
        row.amount.trim() !== ""
          ? row.amount
            : invoice > 0 && Number.isFinite(pct)
            ? String(preserveFractionalMoney((invoice * pct) / 100))
            : "";
      update(row.key, { basis, amount: seeded });
      return;
    }
    const amount = Number(row.amount);
    const seeded =
      row.pct.trim() !== ""
        ? row.pct
        : invoice > 0 && Number.isFinite(amount)
          ? String(roundPct((amount / invoice) * 100))
          : "";
    update(row.key, { basis, pct: seeded, amount: "" });
  }

  function addRow() {
    if (rows.length >= MAX_PAYMENT_TERMS) return;
    const next = [...rows];
    const insertAt = Math.max(rows.length - 1, 0);
    next.splice(insertAt, 0, {
      key: nextRowKey(),
      label: ordinalPaymentLabel(insertAt, rows.length + 1),
      basis: "pct",
      pct: "",
      amount: "",
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
    update(last.key, { basis: "pct", pct: String(remainder), amount: "" });
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
        Each payment can be a percent of the invoice or a fixed amount. Percents
        total 100% when every payment is a percent. A fixed amount is paid
        exactly, and one payment stays the rest of the invoice.
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => {
          const isRemainder = hasAmount && index === plugIndex;
          const remainderAmount = allocated?.[index]?.amount;
          return (
            <div key={row.key} className="flex items-center gap-2">
              <Input
                value={row.label}
                aria-label={`Payment ${index + 1} name`}
                onChange={(e) => update(row.key, { label: e.target.value })}
                placeholder={ordinalPaymentLabel(index, rows.length)}
              />
              <div className="flex shrink-0 rounded-md border border-stone-200 p-0.5">
                <button
                  type="button"
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    row.basis === "pct"
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-50"
                  }`}
                  aria-label={`Payment ${index + 1} as percent`}
                  aria-pressed={row.basis === "pct"}
                  onClick={() => setBasis(row, "pct")}
                >
                  %
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    row.basis === "amount"
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-50"
                  }`}
                  aria-label={`Payment ${index + 1} as amount`}
                  aria-pressed={row.basis === "amount"}
                  onClick={() => setBasis(row, "amount")}
                >
                  Amount
                </button>
              </div>
              {row.basis === "amount" ? (
                <Input
                  className="w-36 shrink-0"
                  type="number"
                  min="0"
                  step="any"
                  value={row.amount}
                  aria-label={`Payment ${index + 1} amount`}
                  onChange={(e) => update(row.key, { amount: e.target.value })}
                />
              ) : isRemainder ? (
                <div className="w-36 shrink-0 text-right text-sm leading-tight text-stone-600">
                  <span className="block text-xs text-stone-500">Rest of the invoice</span>
                  <span className="tabular-nums">
                    {remainderAmount != null
                      ? formatPoMoney(remainderAmount, currency)
                      : "—"}
                  </span>
                </div>
              ) : (
                <div className="flex w-36 shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.pct}
                    aria-label={`Payment ${index + 1} percent`}
                    onChange={(e) => update(row.key, { pct: e.target.value })}
                  />
                  <span className="text-sm text-stone-500">%</span>
                </div>
              )}
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
          );
        })}
      </div>
      {error && (
        <p className="text-xs text-amber-800">
          {error}{" "}
          {error.includes("100%") && (
            <button
              type="button"
              className="font-medium underline"
              onClick={putRemainderOnLast}
            >
              Put the remainder on the last payment
            </button>
          )}
        </p>
      )}
    </div>
  );
}
