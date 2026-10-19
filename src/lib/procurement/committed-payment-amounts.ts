import { preserveFractionalMoney } from "@/lib/procurement/currencies";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import type { PurchaseOrder } from "@/types/database";

export type PlanAmountRow = {
  amount: number;
};

export type CommittedPaymentSchedule = {
  downPayment: number;
  balance: number;
  invoiceTotal: number;
  /** Share of the live invoice total represented by the down payment. */
  downPaymentPct: number;
  /** Share of the live invoice total remaining after the down payment. */
  finalPaymentPct: number;
  /** True when a logged payment is holding the down-payment amount fixed. */
  isCommitted: boolean;
};

function statedMoney(n: number): number {
  return preserveFractionalMoney(n);
}

function percentsFromAmounts(
  downPayment: number,
  invoiceTotal: number,
): { downPaymentPct: number; finalPaymentPct: number } {
  if (!(invoiceTotal > 0)) {
    return { downPaymentPct: 0, finalPaymentPct: 0 };
  }
  const downPaymentPct = (downPayment / invoiceTotal) * 100;
  return {
    downPaymentPct,
    finalPaymentPct: ((invoiceTotal - downPayment) / invoiceTotal) * 100,
  };
}

/** Format a payment split for labels, e.g. 30 or 27.5. */
export function formatPaymentPct(pct: number): string {
  if (!Number.isFinite(pct)) return "0";
  const rounded = Math.round(pct * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function downPaymentLabel(pct: number): string {
  return `Down payment (${formatPaymentPct(pct)}%)`;
}

export function finalPaymentLabel(pct: number): string {
  return `Final payment (${formatPaymentPct(pct)}%)`;
}

export type SchedulePaymentRef = {
  purpose: string;
  amount: number;
  currency?: string | null;
};

type PoWithCommitted = Pick<
  PurchaseOrder,
  | "lines"
  | "discount_amount"
  | "tax_pct"
  | "pph_pct"
  | "other_charges"
  | "down_payment_pct"
  | "committed_invoice_total"
  | "committed_down_payment"
  | "committed_balance"
  | "payment_amounts_committed_at"
> & {
  status?: PurchaseOrder["status"];
  /**
   * Loaded payments. An empty list means none are logged, so the schedule
   * follows `down_payment_pct`. Omit the field when payments were not queried.
   */
  payments?: SchedulePaymentRef[] | null;
};

/** Nulls written when a PO has no payments left to lock the schedule. */
export const CLEARED_COMMITTED_PAYMENT_AMOUNTS = {
  committed_invoice_total: null,
  committed_down_payment: null,
  committed_balance: null,
  payment_amounts_committed_at: null,
} as const;

function liveSchedule(
  live: ReturnType<typeof computePoInvoiceTotals>,
): CommittedPaymentSchedule {
  return {
    downPayment: live.downPayment,
    balance: live.finalPayment,
    invoiceTotal: live.invoiceTotal,
    downPaymentPct: live.downPaymentPct,
    finalPaymentPct: Math.max(0, 100 - live.downPaymentPct),
    isCommitted: false,
  };
}

function hasLoggedPayment(payments: SchedulePaymentRef[]): boolean {
  return payments.some((payment) => Number(payment.amount) > 0);
}

export function sumPlanRowAmounts(rows: PlanAmountRow[]): number {
  return statedMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

/**
 * Payment schedule for PDF / expectations / remaining balance.
 *
 * Invoice total always follows live lines and charges. Until a payment is
 * logged, the down payment is `down_payment_pct` of that total. A stored
 * committed amount is ignored in that case, including one left behind by an
 * AP filing or a payment that was later removed. Once a payment is logged,
 * that down-payment amount stays fixed even if qty, price, or the percentage
 * later change, and the label is that amount's share of the current invoice.
 * The balance is the live invoice minus the down payment.
 */
export function resolvePaymentSchedule(
  po: PoWithCommitted,
): CommittedPaymentSchedule {
  const live = computePoInvoiceTotals(po);
  if (po.payments != null && !hasLoggedPayment(po.payments)) {
    return liveSchedule(live);
  }

  const hasCommitted =
    po.committed_down_payment != null ||
    po.committed_balance != null ||
    po.committed_invoice_total != null ||
    po.payment_amounts_committed_at != null;

  if (!hasCommitted) {
    return liveSchedule(live);
  }

  const downPayment =
    po.committed_down_payment != null
      ? Number(po.committed_down_payment)
      : live.downPayment;
  const invoiceTotal = live.invoiceTotal;
  const balance = statedMoney(invoiceTotal - downPayment);
  const { downPaymentPct, finalPaymentPct } = percentsFromAmounts(
    downPayment,
    invoiceTotal,
  );

  return {
    downPayment,
    balance,
    invoiceTotal,
    downPaymentPct,
    finalPaymentPct,
    isCommitted: true,
  };
}

export type CommittedAmountsPatch = {
  committed_down_payment: number;
  committed_balance: number;
  committed_invoice_total: number;
  payment_amounts_committed_at: string;
};

/** Freeze from live totals, overriding the purpose being logged with its actual amount. */
export function buildCommittedPatchFromPayment(
  po: PoWithCommitted,
  purpose: string,
  amount: number,
  committedAt = new Date().toISOString(),
  options?: { replaceExisting?: boolean },
): CommittedAmountsPatch | null {
  if (!options?.replaceExisting) {
    if (po.payment_amounts_committed_at) return null;
    if (
      po.committed_down_payment != null ||
      po.committed_balance != null ||
      po.committed_invoice_total != null
    ) {
      return null;
    }
  }

  const live = computePoInvoiceTotals(po);
  const normalized = purpose.trim().toLowerCase();
  let down = live.downPayment;
  let balance = live.finalPayment;
  if (normalized === "down payment") {
    down = statedMoney(amount);
  } else if (normalized === "balance payment") {
    balance = statedMoney(amount);
  }

  return {
    committed_down_payment: statedMoney(down),
    committed_balance: statedMoney(balance),
    committed_invoice_total: statedMoney(down + balance),
    payment_amounts_committed_at: committedAt,
  };
}

/** Freeze from live invoice totals when logging the first payment (no prior AP freeze). */
export function buildCommittedPatchFromLiveTotals(
  po: PoWithCommitted,
  committedAt = new Date().toISOString(),
): CommittedAmountsPatch | null {
  if (po.payment_amounts_committed_at) return null;
  if (
    po.committed_down_payment != null ||
    po.committed_balance != null ||
    po.committed_invoice_total != null
  ) {
    return null;
  }

  const live = computePoInvoiceTotals(po);
  return {
    committed_down_payment: live.downPayment,
    committed_balance: live.finalPayment,
    committed_invoice_total: live.invoiceTotal,
    payment_amounts_committed_at: committedAt,
  };
}
