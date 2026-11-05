import type { PoPayment, PurchaseOrder } from "@/types/database";
import {
  DEFAULT_PO_CURRENCY,
  preserveFractionalMoney,
} from "@/lib/procurement/currencies";
import { resolvePaymentSchedule } from "@/lib/procurement/committed-payment-amounts";
import { paymentAmountIdrSync } from "@/lib/procurement/payment-idr";
import { purposeMatchesPaymentTerm } from "@/lib/procurement/payment-terms";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";

export type PaymentFulfillmentStatus = "underpaid" | "paid" | "overpaid";

function normalizePurpose(purpose: string): string {
  return purpose.trim().toLowerCase();
}

export function isDownPaymentPurpose(purpose: string): boolean {
  return normalizePurpose(purpose) === "down payment";
}

export function isBalancePaymentPurpose(purpose: string): boolean {
  return normalizePurpose(purpose) === "balance payment";
}

export function poCurrencyTolerance(currency: string): number {
  if (currency === "IDR" || currency === "JPY" || currency === "KRW") return 1;
  return 0.01;
}

export function paymentFulfillmentStatus(
  expected: number,
  paid: number,
  currency: string,
): PaymentFulfillmentStatus {
  const variance = paid - expected;
  if (Math.abs(variance) <= poCurrencyTolerance(currency)) return "paid";
  return variance < 0 ? "underpaid" : "overpaid";
}

/**
 * A settled invoice has no unpaid installment. Money logged against one
 * purpose, or against none of them, still covers the down payment when the
 * payments add up to the invoice.
 * Short installments are shown as paid for their expected amount. An
 * installment that was actually overpaid stays overpaid.
 */
export function coverInstallmentsWhenInvoiceSettled<
  T extends { expected: number; paid: number },
>(
  installments: readonly T[],
  totalPaid: number,
  currency: string,
): Array<T & { status: PaymentFulfillmentStatus }> {
  const expectedTotal = installments.reduce((sum, term) => sum + term.expected, 0);
  const invoiceSettled =
    paymentFulfillmentStatus(expectedTotal, totalPaid, currency) !== "underpaid";

  return installments.map((term) => {
    const status = paymentFulfillmentStatus(term.expected, term.paid, currency);
    if (invoiceSettled && status === "underpaid") {
      return { ...term, paid: term.expected, status: "paid" };
    }
    return { ...term, status };
  });
}

export function sumPaymentsInPoCurrency(
  payments: PoPayment[],
  poCurrency: string,
  purposeMatcher?: (purpose: string) => boolean,
): number {
  return payments
    .filter(
      (payment) =>
        (payment.currency ?? poCurrency) === poCurrency &&
        (!purposeMatcher || purposeMatcher(payment.purpose)),
    )
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

export function paymentIdrAmount(payment: PoPayment): number | null {
  return paymentAmountIdrSync(payment);
}

function laterInstallmentStatus(
  terms: { status: PaymentFulfillmentStatus }[],
): PaymentFulfillmentStatus {
  if (terms.some((term) => term.status === "underpaid")) return "underpaid";
  if (terms.some((term) => term.status === "overpaid")) return "overpaid";
  return "paid";
}

export function computePoPaymentSummary(po: PurchaseOrder) {
  const poCurrency = po.currency ?? DEFAULT_PO_CURRENCY;
  const schedule = resolvePaymentSchedule(po);
  const payments = po.payments ?? [];

  const paidTotalPoCurrency = sumPaymentsInPoCurrency(payments, poCurrency);
  const installments = coverInstallmentsWhenInvoiceSettled(
    schedule.terms.map((term, index) => ({
      label: term.label,
      pct: term.pct,
      expected: term.amount,
      paid: sumPaymentsInPoCurrency(payments, poCurrency, (purpose) =>
        purposeMatchesPaymentTerm(purpose, index, schedule.terms),
      ),
    })),
    paidTotalPoCurrency,
    poCurrency,
  );
  const paidDown = installments[0]?.paid ?? 0;
  const paidBalance = installments.slice(1).reduce((sum, term) => sum + term.paid, 0);

  const totalIdr = payments.reduce(
    (sum, payment) => sum + (paymentIdrAmount(payment) ?? 0),
    0,
  );

  return {
    poCurrency,
    expectedDown: schedule.downPayment,
    expectedBalance: schedule.balance,
    expectedTotal: schedule.invoiceTotal,
    paymentScheduleCommitted: schedule.isCommitted,
    paidDown,
    paidBalance,
    paidTotalPoCurrency,
    totalIdr,
    installments,
    downStatus: installments[0]?.status ??
      paymentFulfillmentStatus(schedule.downPayment, paidDown, poCurrency),
    balanceStatus: laterInstallmentStatus(installments.slice(1)),
    overallStatus: paymentFulfillmentStatus(
      schedule.invoiceTotal,
      paidTotalPoCurrency,
      poCurrency,
    ),
    /** Live line-based totals (equals expectedTotal after a committed down payment). */
    liveInvoiceTotal: computePoInvoiceTotals(po).invoiceTotal,
  };
}

export const PAYMENT_STATUS_LABELS: Record<PaymentFulfillmentStatus, string> = {
  underpaid: "Underpaid",
  paid: "Fully paid",
  overpaid: "Overpaid",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentFulfillmentStatus, string> = {
  underpaid: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  overpaid: "bg-rose-100 text-rose-800",
};

export function previewPaymentIdr(
  amount: number,
  currency: string,
  exchangeRate: string,
): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (currency === "IDR") return preserveFractionalMoney(amount);
  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(amount * rate);
}
