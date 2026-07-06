"use client";

import { useMemo, useState } from "react";
import { Banknote, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";
import {
  DEFAULT_PO_CURRENCY,
  formatPoMoney,
  PO_CURRENCIES,
} from "@/lib/procurement/currencies";
import { PO_PAYMENT_PURPOSES } from "@/lib/procurement/po-payment-purposes";
import {
  computePoPaymentSummary,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  paymentIdrAmount,
  previewPaymentIdr,
} from "@/lib/procurement/po-payment-status";
import type { PoPayment, PurchaseOrder } from "@/types/database";
import { StatusUpdateNotesLink } from "@/components/status-updates/status-update-notes-link";
import { useStatusUpdateCounts } from "@/lib/hooks/use-status-update-counts";

interface PaymentFormState {
  paymentDate: string;
  amount: string;
  paymentRequestNumber: string;
  currency: string;
  exchangeRate: string;
  purpose: string;
  customPurpose: string;
}

function emptyPaymentForm(poCurrency: string): PaymentFormState {
  return {
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentRequestNumber: "",
    currency: poCurrency,
    exchangeRate: "",
    purpose: PO_PAYMENT_PURPOSES[0],
    customPurpose: "",
  };
}

function paymentFormFromRecord(payment: PoPayment): PaymentFormState {
  const isPreset = (PO_PAYMENT_PURPOSES as readonly string[]).includes(
    payment.purpose,
  );
  return {
    paymentDate: payment.payment_date,
    amount: String(payment.amount),
    paymentRequestNumber: payment.payment_request_number,
    currency: payment.currency,
    exchangeRate:
      payment.exchange_rate != null ? String(payment.exchange_rate) : "",
    purpose: isPreset ? payment.purpose : "Other",
    customPurpose: isPreset ? "" : payment.purpose,
  };
}

function resolvePurpose(purpose: string, customPurpose: string): string {
  if (purpose === "Other") return customPurpose.trim();
  return purpose;
}

export function PoPaymentsSection({
  po,
  busy,
  setBusy,
  setError,
  onUpdated,
}: {
  po: PurchaseOrder;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  onUpdated: (po: PurchaseOrder) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() =>
    emptyPaymentForm(po.currency ?? DEFAULT_PO_CURRENCY),
  );

  const payments = useMemo(
    () =>
      [...(po.payments ?? [])].sort((a, b) =>
        b.payment_date.localeCompare(a.payment_date),
      ),
    [po.payments],
  );

  const paymentIds = useMemo(
    () => payments.map((payment) => payment.id),
    [payments],
  );
  const paymentNoteCounts = useStatusUpdateCounts("payment", paymentIds);

  const summary = useMemo(() => computePoPaymentSummary(po), [po]);
  const fmt = (value: number, currency = summary.poCurrency) =>
    formatPoMoney(value, currency);
  const fmtIdr = (value: number | null) =>
    value == null ? "—" : formatPoMoney(value, "IDR");

  const formIdrPreview = previewPaymentIdr(
    Number(form.amount),
    form.currency,
    form.exchangeRate,
  );

  function openAddForm() {
    setEditingId(null);
    setForm(emptyPaymentForm(summary.poCurrency));
    setFormOpen(true);
  }

  function openEditForm(payment: PoPayment) {
    setEditingId(payment.id);
    setForm(paymentFormFromRecord(payment));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyPaymentForm(summary.poCurrency));
  }

  async function savePayment() {
    const amount = Number(form.amount);
    const purpose = resolvePurpose(form.purpose, form.customPurpose);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a positive payment amount.");
      return;
    }
    if (!form.paymentRequestNumber.trim()) {
      setError("Payment request number is required.");
      return;
    }
    if (!purpose) {
      setError("Payment purpose is required.");
      return;
    }
    if (form.currency !== "IDR") {
      const rate = Number(form.exchangeRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        setError(
          `Enter the exchange rate from ${form.currency} to IDR (IDR per 1 ${form.currency}).`,
        );
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        payment_date: form.paymentDate,
        amount,
        payment_request_number: form.paymentRequestNumber.trim(),
        currency: form.currency,
        exchange_rate:
          form.currency === "IDR" ? null : Number(form.exchangeRate),
        purpose,
      };

      const url = editingId
        ? `/api/procurement/pos/${po.id}/payments/${editingId}`
        : `/api/procurement/pos/${po.id}/payments`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save payment");
      onUpdated(data.purchaseOrder);
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payment");
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(payment: PoPayment) {
    if (
      !window.confirm(
        `Delete payment ${payment.payment_request_number} (${fmt(payment.amount, payment.currency)})?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/payments/${payment.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete payment");
      onUpdated(data.purchaseOrder);
      if (editingId === payment.id) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-stone-500" />
          <p className="text-sm font-medium text-stone-700">Payments</p>
        </div>
        {!formOpen && (
          <Button size="sm" variant="outline" onClick={openAddForm} disabled={busy}>
            <Plus className="h-3.5 w-3.5" />
            Log payment
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <p className="text-stone-500">Down payment ({summary.poCurrency})</p>
          <p className="mt-0.5 font-medium text-stone-900">
            {fmt(summary.paidDown)} / {fmt(summary.expectedDown)}
          </p>
          <Badge className={`mt-1 ${PAYMENT_STATUS_STYLES[summary.downStatus]}`}>
            {PAYMENT_STATUS_LABELS[summary.downStatus]}
          </Badge>
        </div>
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <p className="text-stone-500">Balance ({summary.poCurrency})</p>
          <p className="mt-0.5 font-medium text-stone-900">
            {fmt(summary.paidBalance)} / {fmt(summary.expectedBalance)}
          </p>
          <Badge
            className={`mt-1 ${PAYMENT_STATUS_STYLES[summary.balanceStatus]}`}
          >
            {PAYMENT_STATUS_LABELS[summary.balanceStatus]}
          </Badge>
        </div>
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <p className="text-stone-500">Invoice ({summary.poCurrency})</p>
          <p className="mt-0.5 font-medium text-stone-900">
            {fmt(summary.paidTotalPoCurrency)} / {fmt(summary.expectedTotal)}
          </p>
          <Badge
            className={`mt-1 ${PAYMENT_STATUS_STYLES[summary.overallStatus]}`}
          >
            {PAYMENT_STATUS_LABELS[summary.overallStatus]}
          </Badge>
        </div>
      </div>

      {payments.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Request #</th>
                <th className="px-3 py-2">Purpose</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">IDR</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-stone-100">
                  <td className="px-3 py-2 text-stone-700">{payment.payment_date}</td>
                  <td className="px-3 py-2 font-medium text-stone-900">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {payment.payment_request_number}
                      <StatusUpdateNotesLink
                        entityType="payment"
                        entityId={payment.id}
                        count={paymentNoteCounts.get(payment.id)?.count}
                      />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-stone-700">{payment.purpose}</td>
                  <td className="px-3 py-2 text-right font-medium text-stone-900">
                    {formatPoMoney(payment.amount, payment.currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-600">
                    {payment.currency !== "IDR" && payment.exchange_rate != null
                      ? formatNumber(payment.exchange_rate)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-stone-900">
                    {fmtIdr(paymentIdrAmount(payment))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditForm(payment)}
                        disabled={busy}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removePayment(payment)}
                        disabled={busy}
                        className="text-rose-700 hover:text-rose-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-stone-500">No payments logged yet.</p>
      )}

      <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-stone-600">
            Total paid ({summary.poCurrency}) — for PO status
          </span>
          <span className="font-medium text-stone-900">
            {fmt(summary.paidTotalPoCurrency)}
          </span>
        </div>
        <div className="mt-1 flex justify-between gap-2 border-t border-stone-200 pt-1">
          <span className="text-stone-600">Total spent (IDR) — internal</span>
          <span className="font-semibold text-stone-900">
            {fmtIdr(summary.totalIdr)}
          </span>
        </div>
      </div>

      {formOpen && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="mb-3 text-sm font-medium text-stone-800">
            {editingId ? "Edit payment" : "Log payment"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Payment date</span>
              <Input
                type="date"
                value={form.paymentDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, paymentDate: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Amount</span>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.amount}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, amount: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Payment request #</span>
              <Input
                value={form.paymentRequestNumber}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentRequestNumber: e.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Currency</span>
              <Select
                value={form.currency}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    currency: e.target.value,
                    exchangeRate: e.target.value === "IDR" ? "" : prev.exchangeRate,
                  }))
                }
              >
                {PO_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </label>
            {form.currency !== "IDR" && (
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-stone-600">
                  Exchange rate — IDR per 1 {form.currency}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.exchangeRate}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      exchangeRate: e.target.value,
                    }))
                  }
                  placeholder="Required"
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Purpose</span>
              <Select
                value={form.purpose}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, purpose: e.target.value }))
                }
              >
                {PO_PAYMENT_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </label>
            {form.purpose === "Other" && (
              <label className="block text-sm">
                <span className="mb-1 block text-stone-600">Custom purpose</span>
                <Input
                  value={form.customPurpose}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      customPurpose: e.target.value,
                    }))
                  }
                />
              </label>
            )}
          </div>
          {formIdrPreview != null && (
            <p className="mt-3 text-sm text-stone-600">
              IDR equivalent:{" "}
              <span className="font-semibold text-stone-900">
                {formatPoMoney(formIdrPreview, "IDR")}
              </span>
            </p>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Underpaid / fully paid / overpaid on this PO is judged in{" "}
            {summary.poCurrency}. IDR is recorded for internal spend tracking only.
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={savePayment} disabled={busy}>
              {editingId ? "Save changes" : "Add payment"}
            </Button>
            <Button size="sm" variant="outline" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
