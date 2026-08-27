import type { PoPayment, PurchaseOrder } from "@/types/database";
import { DEFAULT_PO_CURRENCY } from "@/lib/procurement/currencies";
import { resolvePaymentSchedule } from "@/lib/procurement/committed-payment-amounts";
import { paymentAmountIdrSync } from "@/lib/procurement/payment-idr";
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

export function computePoPaymentSummary(po: PurchaseOrder) {
  const poCurrency = po.currency ?? DEFAULT_PO_CURRENCY;
  const schedule = resolvePaymentSchedule(po);
  const payments = po.payments ?? [];

  const paidDown = sumPaymentsInPoCurrency(
    payments,
    poCurrency,
    isDownPaymentPurpose,
  );
  const paidBalance = sumPaymentsInPoCurrency(
    payments,
    poCurrency,
    isBalancePaymentPurpose,
  );
  const paidTotalPoCurrency = sumPaymentsInPoCurrency(payments, poCurrency);

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
    downStatus: paymentFulfillmentStatus(
      schedule.downPayment,
      paidDown,
      poCurrency,
    ),
    balanceStatus: paymentFulfillmentStatus(
      schedule.balance,
      paidBalance,
      poCurrency,
    ),
    overallStatus: paymentFulfillmentStatus(
      schedule.invoiceTotal,
      paidTotalPoCurrency,
      poCurrency,
    ),
    /** Live line-based totals (for reference when schedule is frozen). */
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
  if (currency === "IDR") return Math.round(amount);
  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(amount * rate);
}
