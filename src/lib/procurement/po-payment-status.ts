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
 * A settled invoice has no unpaid installment. One final payment for the
 * whole PO covers the scheduled down payment instead of leaving that line
 * empty and marking the final payment overpaid by the same money.
 * Amounts are moved, not copied, so the installments still add up to what
 * was paid. Anything above the invoice stays on the last installment.
 */
export function coverInstallmentsWhenInvoiceSettled<
  T extends { expected: number; paid: number },
>(
  installments: readonly T[],
  totalPaid: number,
  currency: string,
): Array<T & { status: PaymentFulfillmentStatus }> {
  const withStatus = (paid: readonly number[]) =>
    installments.map((term, index) => {
      const amount = preserveFractionalMoney(paid[index] ?? 0);
      return {
        ...term,
        paid: amount,
        status: paymentFulfillmentStatus(term.expected, amount, currency),
      };
    });

  const expectedTotal = installments.reduce((sum, term) => sum + term.expected, 0);
  const invoiceSettled =
    paymentFulfillmentStatus(expectedTotal, totalPaid, currency) !== "underpaid";
  if (!invoiceSettled || installments.length === 0) {
    return withStatus(installments.map((term) => term.paid));
  }

  const tolerance = poCurrencyTolerance(currency);
  const paid = installments.map((term) => term.paid);
  let pool =
    totalPaid - paid.reduce((sum, amount) => sum + amount, 0);

  const shortfallAt = (index: number) =>
    Math.max(0, installments[index]!.expected - paid[index]!);
  const surplusAt = (index: number) =>
    Math.max(0, paid[index]! - installments[index]!.expected);

  for (let index = 0; index < paid.length && pool > tolerance; index++) {
    const need = shortfallAt(index);
    if (need <= tolerance) continue;
    const take = Math.min(pool, need);
    paid[index] = paid[index]! + take;
    pool -= take;
  }

  for (let index = 0; index < paid.length; index++) {
    let need = shortfallAt(index);
    if (need <= tolerance) continue;
    for (let source = paid.length - 1; source >= 0 && need > tolerance; source--) {
      if (source === index) continue;
      const extra = surplusAt(source);
      if (extra <= tolerance) continue;
      const take = Math.min(need, extra);
      paid[source] = paid[source]! - take;
      paid[index] = paid[index]! + take;
      need -= take;
    }
  }

  if (pool > tolerance) {
    const last = paid.length - 1;
    paid[last] = paid[last]! + pool;
  }

  return withStatus(paid);
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
