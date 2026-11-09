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
import {
  formatMoneyInput,
  parseMoneyInput,
} from "@/lib/procurement/money-input";
import { PO_PAYMENT_PURPOSES } from "@/lib/procurement/po-payment-purposes";
import { paymentPurposeChoices } from "@/lib/procurement/payment-terms";
import {
  computePoPaymentSummary,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  paymentFulfillmentStatus,
  paymentIdrAmount,
  paymentTaxWithholding,
  paymentWithholdingIdr,
  previewPaymentIdr,
  type PaymentFulfillmentStatus,
} from "@/lib/procurement/po-payment-status";
import type { PoPayment, PurchaseOrder } from "@/types/database";
import { StatusUpdateNotesLink } from "@/components/status-updates/status-update-notes-link";
import { useStatusUpdateCounts } from "@/lib/hooks/use-status-update-counts";

interface PaymentFormState {
  paymentDate: string;
  amount: string;
  taxWithholding: string;
  paymentRequestNumber: string;
  currency: string;
  exchangeRate: string;
  purpose: string;
  customPurpose: string;
}

function settlementFlag(input: {
  supplier: number;
  withholding: number;
  expected: number;
  currency: string;
}): { status: PaymentFulfillmentStatus; text: string } | null {
  if (!(input.withholding > 0)) return null;
  const applied = input.supplier + input.withholding;
  const status = paymentFulfillmentStatus(
    input.expected,
    applied,
    input.currency,
  );
  const supplier = formatPoMoney(input.supplier, input.currency);
  const withholding = formatPoMoney(input.withholding, input.currency);
  const expected = formatPoMoney(input.expected, input.currency);
  if (status === "paid") {
    return {
      status,
      text: `Logged payments of ${supplier} plus tax withholding of ${withholding} match the invoice total of ${expected}. The withholding is paid to the government, and the invoice is fully paid.`,
    };
  }
  const appliedLabel = formatPoMoney(applied, input.currency);
  const direction = status === "underpaid" ? "short of" : "above";
  return {
    status,
    text: `Logged payments of ${supplier} plus tax withholding of ${withholding} equal ${appliedLabel}, which is ${direction} the invoice total of ${expected}.`,
  };
}

function projectSettlement(input: {
  withholdingAmount: number | null;
  amount: string;
  currency: string;
  poCurrency: string;
  expectedTotal: number;
  editingId: string | null;
  payments: PoPayment[];
}): { status: PaymentFulfillmentStatus; text: string } | null {
  if (input.withholdingAmount == null || input.withholdingAmount <= 0) return null;
  if (input.currency !== input.poCurrency) return null;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const others = input.payments.filter(
    (payment) =>
      payment.id !== input.editingId &&
      (payment.currency ?? input.poCurrency) === input.poCurrency,
  );
  const supplier =
    others.reduce((sum, payment) => sum + Number(payment.amount), 0) + amount;
  const withholding =
    others.reduce((sum, payment) => sum + paymentTaxWithholding(payment), 0) +
    input.withholdingAmount;
  return settlementFlag({
    supplier,
    withholding,
    expected: input.expectedTotal,
    currency: input.poCurrency,
  });
}

function settlementFlagClass(status: PaymentFulfillmentStatus): string {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "overpaid") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function emptyPaymentForm(
  poCurrency: string,
  purpose: string = PO_PAYMENT_PURPOSES[0],
): PaymentFormState {
  return {
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    taxWithholding: "",
    paymentRequestNumber: "",
    currency: poCurrency,
    exchangeRate: "",
    purpose,
    customPurpose: "",
  };
}

function paymentFormFromRecord(
  payment: PoPayment,
  choices: readonly string[],
): PaymentFormState {
  const isPreset = choices.includes(payment.purpose);
  return {
    paymentDate: payment.payment_date,
    amount: String(payment.amount),
    taxWithholding: formatMoneyInput(paymentTaxWithholding(payment)),
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
  const purposeChoices = useMemo(
    () => paymentPurposeChoices(summary.installments.map((term) => term.label)),
    [summary.installments],
  );
  const fmt = (value: number, currency = summary.poCurrency) =>
    formatPoMoney(value, currency);
  const fmtIdr = (value: number | null) =>
    value == null ? "—" : formatPoMoney(value, "IDR");

  const formIdrPreview = previewPaymentIdr(
    Number(form.amount),
    form.currency,
    form.exchangeRate,
  );
  const withholdingAmount = parseMoneyInput(form.taxWithholding);
  const withholdingInvalid =
    form.taxWithholding.trim() !== "" && withholdingAmount == null;
  const withholdingIdrPreview =
    withholdingAmount != null && withholdingAmount > 0
      ? previewPaymentIdr(withholdingAmount, form.currency, form.exchangeRate)
      : null;
  const draftSettlement = projectSettlement({
    withholdingAmount,
    amount: form.amount,
    currency: form.currency,
    poCurrency: summary.poCurrency,
    expectedTotal: summary.expectedTotal,
    editingId,
    payments,
  });
  const savedSettlement = settlementFlag({
    supplier: summary.paidToSupplier,
    withholding: summary.taxWithholding,
    expected: summary.expectedTotal,
    currency: summary.poCurrency,
  });

  function openAddForm() {
    setEditingId(null);
    setForm(
      emptyPaymentForm(
        summary.poCurrency,
        purposeChoices[0] ?? PO_PAYMENT_PURPOSES[0],
      ),
    );
    setFormOpen(true);
  }

  function openEditForm(payment: PoPayment) {
    setEditingId(payment.id);
    setForm(paymentFormFromRecord(payment, purposeChoices));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(
      emptyPaymentForm(
        summary.poCurrency,
        purposeChoices[0] ?? PO_PAYMENT_PURPOSES[0],
      ),
    );
  }

  async function savePayment() {
    const amount = Number(form.amount);
    const taxWithholding = parseMoneyInput(form.taxWithholding);
    const purpose = resolvePurpose(form.purpose, form.customPurpose);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a positive payment amount.");
      return;
    }
    if (taxWithholding == null) {
      setError("Enter the tax withholding as an amount, for example 2,000,000.");
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
        tax_withholding: taxWithholding,
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

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {summary.installments.map((installment) => (
          <div
            key={installment.label}
            className="rounded-lg bg-stone-50 px-3 py-2 text-sm"
          >
            <p className="text-stone-500">
              {installment.label} ({summary.poCurrency})
            </p>
            <p className="mt-0.5 font-medium text-stone-900">
              {fmt(installment.paid)} / {fmt(installment.expected)}
            </p>
            <Badge className={`mt-1 ${PAYMENT_STATUS_STYLES[installment.status]}`}>
              {PAYMENT_STATUS_LABELS[installment.status]}
            </Badge>
          </div>
        ))}
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
          {summary.taxWithholding > 0 && (
            <p className="mt-1 text-xs text-stone-500">
              Includes {fmt(summary.taxWithholding)} tax withholding
            </p>
          )}
        </div>
      </div>

      {!formOpen && savedSettlement && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${settlementFlagClass(savedSettlement.status)}`}
        >
          {savedSettlement.text}
        </div>
      )}

      {payments.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Request #</th>
                <th className="px-3 py-2">Purpose</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Withholding</th>
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
                  <td className="px-3 py-2 text-right text-stone-700">
                    {paymentTaxWithholding(payment) > 0
                      ? formatPoMoney(
                          paymentTaxWithholding(payment),
                          payment.currency,
                        )
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-600">
                    {payment.currency !== "IDR" && payment.exchange_rate != null
                      ? formatNumber(payment.exchange_rate)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-stone-900">
                    {fmtIdr(
                      paymentIdrAmount(payment) == null
                        ? null
                        : (paymentIdrAmount(payment) ?? 0) +
                            paymentWithholdingIdr(payment),
                    )}
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
        {summary.taxWithholding > 0 ? (
          <>
            <div className="flex justify-between gap-2">
              <span className="text-stone-600">
                Paid to supplier ({summary.poCurrency})
              </span>
              <span className="font-medium text-stone-900">
                {fmt(summary.paidToSupplier)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-stone-600">
                Tax withholding ({summary.poCurrency}) — paid to the government
              </span>
              <span className="font-medium text-stone-900">
                {fmt(summary.taxWithholding)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2 border-t border-stone-200 pt-1">
              <span className="text-stone-600">
                Applied to invoice ({summary.poCurrency})
              </span>
              <span className="font-medium text-stone-900">
                {fmt(summary.paidTotalPoCurrency)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-2">
            <span className="text-stone-600">
              Total paid ({summary.poCurrency}) — for PO status
            </span>
            <span className="font-medium text-stone-900">
              {fmt(summary.paidTotalPoCurrency)}
            </span>
          </div>
        )}
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
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-stone-600">Tax withholding</span>
              <Input
                inputMode="decimal"
                autoComplete="off"
                value={form.taxWithholding}
                placeholder="2,000,000"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    taxWithholding: e.target.value,
                  }))
                }
              />
              <span className="mt-1 block text-xs text-stone-500">
                Optional. Withheld from the supplier and paid to the government.
                The supplier receives the payment amount. Type 2,000,000 for two
                million. Logged payments plus this withholding are compared with
                the invoice total. Leave it blank when that total already has
                PPh deducted.
              </span>
              {withholdingInvalid && (
                <span className="mt-1 block text-xs text-rose-700">
                  Enter an amount such as 2,000,000.
                </span>
              )}
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
                {purposeChoices.map((p) => (
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
              {withholdingIdrPreview != null && (
                <>
                  . Tax withholding:{" "}
                  <span className="font-semibold text-stone-900">
                    {formatPoMoney(withholdingIdrPreview, "IDR")}
                  </span>{" "}
                  paid to the government
                </>
              )}
            </p>
          )}
          {draftSettlement && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${settlementFlagClass(draftSettlement.status)}`}
            >
              {draftSettlement.text}
            </div>
          )}
          {withholdingAmount != null &&
            withholdingAmount > 0 &&
            form.currency !== summary.poCurrency && (
              <p className="mt-3 text-sm text-amber-800">
                This withholding is in {form.currency}, so it is not compared
                with the {summary.poCurrency} invoice total.
              </p>
            )}
          <p className="mt-2 text-xs text-stone-500">
            Underpaid / fully paid / overpaid on this PO is judged in{" "}
            {summary.poCurrency}. A tax withholding counts toward that total.
            IDR is recorded for internal spend tracking only.
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
