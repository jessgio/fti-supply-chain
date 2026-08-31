import type { ApPaymentPlanScope } from "@/lib/lark/ap-form";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import type { PurchaseOrder } from "@/types/database";

export type PlanAmountRow = {
  amount: number;
};

export type CommittedPaymentSchedule = {
  downPayment: number;
  balance: number;
  invoiceTotal: number;
  /** True when at least one committed amount is stored on the PO. */
  isCommitted: boolean;
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
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumPlanRowAmounts(rows: PlanAmountRow[]): number {
  return round2(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

/**
 * Payment schedule for PDF / expectations / remaining balance.
 *
 * Invoice total always follows live lines and charges. Once a down payment has
 * been logged (or frozen on the PO), that exact amount is kept even if qty or
 * price later change. The remaining balance is live invoice minus that down
 * payment — never a frozen remainder, and never a fresh % of the new total.
 */
export function resolvePaymentSchedule(
  po: PoWithCommitted,
): CommittedPaymentSchedule {
  const live = computePoInvoiceTotals(po);
  const hasCommitted =
    po.committed_down_payment != null ||
    po.committed_balance != null ||
    po.committed_invoice_total != null ||
    po.payment_amounts_committed_at != null;

  if (!hasCommitted) {
    return {
      downPayment: live.downPayment,
      balance: live.finalPayment,
      invoiceTotal: live.invoiceTotal,
      isCommitted: false,
    };
  }

  const downPayment =
    po.committed_down_payment != null
      ? Number(po.committed_down_payment)
      : live.downPayment;
  const invoiceTotal = live.invoiceTotal;
  const balance = round2(invoiceTotal - downPayment);

  return {
    downPayment,
    balance,
    invoiceTotal,
    isCommitted: true,
  };
}

export type CommittedAmountsPatch = {
  committed_down_payment: number;
  committed_balance: number;
  committed_invoice_total: number;
  payment_amounts_committed_at: string;
};

function splitPlanAmounts(
  scope: ApPaymentPlanScope,
  planRows: PlanAmountRow[],
  liveDown: number,
  liveBalance: number,
  liveInvoice: number,
): { down: number; balance: number; invoice: number } {
  const planTotal = sumPlanRowAmounts(planRows);

  if (scope === "down_payment") {
    return {
      down: planTotal,
      balance: liveBalance,
      invoice: round2(planTotal + liveBalance),
    };
  }
  if (scope === "balance") {
    return {
      down: liveDown,
      balance: planTotal,
      invoice: round2(liveDown + planTotal),
    };
  }

  if (planRows.length >= 2) {
    const down = round2(Number(planRows[0]?.amount || 0));
    const balance = round2(Number(planRows[1]?.amount || 0));
    return { down, balance, invoice: round2(down + balance) };
  }

  // Full-payment single row: keep live DP/balance split proportions when possible.
  if (liveInvoice > 0 && liveDown + liveBalance > 0) {
    const down = round2(planTotal * (liveDown / liveInvoice));
    const balance = round2(planTotal - down);
    return { down, balance, invoice: planTotal };
  }

  return { down: 0, balance: planTotal, invoice: planTotal };
}

/**
 * Build PO patch that freezes payment schedule amounts from an AP Form filing.
 * Already-frozen sides are left unchanged (first filed amount wins).
 */
export function buildCommittedPatchFromAp(
  po: PoWithCommitted,
  scope: ApPaymentPlanScope,
  planRows: PlanAmountRow[],
  committedAt = new Date().toISOString(),
): CommittedAmountsPatch | null {
  if (!planRows.length) return null;

  const live = computePoInvoiceTotals(po);
  const fromPlan = splitPlanAmounts(
    scope,
    planRows,
    live.downPayment,
    live.finalPayment,
    live.invoiceTotal,
  );

  const down =
    po.committed_down_payment != null
      ? Number(po.committed_down_payment)
      : scope === "down_payment" || scope === "both"
        ? fromPlan.down
        : live.downPayment;
  const balance =
    po.committed_balance != null
      ? Number(po.committed_balance)
      : scope === "balance" || scope === "both"
        ? fromPlan.balance
        : live.finalPayment;

  return {
    committed_down_payment: round2(down),
    committed_balance: round2(balance),
    committed_invoice_total: round2(down + balance),
    payment_amounts_committed_at:
      po.payment_amounts_committed_at ?? committedAt,
  };
}

/** Freeze from live totals, overriding the purpose being logged with its actual amount. */
export function buildCommittedPatchFromPayment(
  po: PoWithCommitted,
  purpose: string,
  amount: number,
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
  const normalized = purpose.trim().toLowerCase();
  let down = live.downPayment;
  let balance = live.finalPayment;
  if (normalized === "down payment") {
    down = round2(amount);
  } else if (normalized === "balance payment") {
    balance = round2(amount);
  }

  return {
    committed_down_payment: round2(down),
    committed_balance: round2(balance),
    committed_invoice_total: round2(down + balance),
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
