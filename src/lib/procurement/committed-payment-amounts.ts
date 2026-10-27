import { preserveFractionalMoney } from "@/lib/procurement/currencies";
import {
  allocatePaymentTerms,
  configuredPaymentTerms,
  formatPaymentPct,
  normalizePaymentLabel,
  parseCommittedPaymentTerms,
  paymentTermIndexForPurpose,
  type ResolvedPaymentTerm,
  type StoredPaymentTermAmount,
} from "@/lib/procurement/payment-terms";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import type { PurchaseOrder } from "@/types/database";

export { formatPaymentPct };

export type PlanAmountRow = {
  amount: number;
};

export type CommittedPaymentSchedule = {
  downPayment: number;
  /** Invoice total minus the first installment. Equals the final payment when there are two terms. */
  balance: number;
  invoiceTotal: number;
  /** Share of the live invoice total represented by the first installment. */
  downPaymentPct: number;
  /** Share of the live invoice total remaining after the first installment. */
  finalPaymentPct: number;
  /** True when a logged payment is holding installment amounts fixed. */
  isCommitted: boolean;
  /** Every installment, in order. Amounts add up to the invoice total. */
  terms: ResolvedPaymentTerm[];
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
  payment_terms?: PurchaseOrder["payment_terms"];
  committed_payment_terms?: PurchaseOrder["committed_payment_terms"];
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
  committed_payment_terms: null,
  payment_amounts_committed_at: null,
} as const;

function scheduleFromTerms(
  invoiceTotal: number,
  terms: ResolvedPaymentTerm[],
  isCommitted: boolean,
): CommittedPaymentSchedule {
  const downPayment = terms[0]?.amount ?? 0;
  const balance = statedMoney(invoiceTotal - downPayment);
  if (!isCommitted) {
    const downPaymentPct = terms[0]?.configuredPct ?? terms[0]?.pct ?? 0;
    return {
      downPayment,
      balance,
      invoiceTotal,
      downPaymentPct,
      finalPaymentPct: Math.max(0, 100 - downPaymentPct),
      isCommitted,
      terms,
    };
  }

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
    isCommitted,
    terms: terms.map((term, index) => ({
      ...term,
      pct: invoiceTotal > 0 ? (term.amount / invoiceTotal) * 100 : term.configuredPct,
      ...(index === 0 ? { pct: downPaymentPct } : {}),
      ...(index === terms.length - 1 && terms.length === 2
        ? { pct: finalPaymentPct }
        : {}),
    })),
  };
}

function liveSchedule(po: PoWithCommitted): CommittedPaymentSchedule {
  const live = computePoInvoiceTotals(po);
  const terms = allocatePaymentTerms(
    live.invoiceTotal,
    configuredPaymentTerms(po),
    { useConfiguredPercents: true },
  );
  return scheduleFromTerms(live.invoiceTotal, terms, false);
}

function committedTerms(
  po: PoWithCommitted,
  invoiceTotal: number,
): ResolvedPaymentTerm[] {
  const configured = configuredPaymentTerms(po);
  const live = allocatePaymentTerms(invoiceTotal, configured, {
    useConfiguredPercents: false,
  });
  const stored = parseCommittedPaymentTerms(po.committed_payment_terms);
  const frozenByLabel = new Map(
    (stored ?? []).map((term) => [
      normalizePaymentLabel(term.label),
      Number(term.amount),
    ]),
  );
  const legacyDown =
    stored == null && po.committed_down_payment != null
      ? Number(po.committed_down_payment)
      : null;

  let used = 0;
  const amounts = configured.map((term, index) => {
    const isLast = index === configured.length - 1;
    if (isLast) return 0;
    const frozen = frozenByLabel.get(normalizePaymentLabel(term.label));
    const amount =
      frozen != null
        ? statedMoney(frozen)
        : index === 0 && legacyDown != null
          ? statedMoney(legacyDown)
          : live[index]?.amount ?? 0;
    used += amount;
    return amount;
  });
  if (amounts.length > 0) {
    amounts[amounts.length - 1] = statedMoney(invoiceTotal - used);
  }

  return configured.map((term, index) => ({
    label: term.label,
    amount: amounts[index] ?? 0,
    pct: term.pct,
    configuredPct: term.pct,
  }));
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
 * logged, each installment is its configured percent of that total. A stored
 * committed amount is ignored in that case, including one left behind by an
 * AP filing or a payment that was later removed. Once a payment is logged,
 * every installment except the last stays fixed even if qty, price, or the
 * percentages later change, and each label is that amount's share of the
 * current invoice. The last installment is the live invoice minus the earlier ones.
 */
export function resolvePaymentSchedule(
  po: PoWithCommitted,
): CommittedPaymentSchedule {
  const live = computePoInvoiceTotals(po);
  if (po.payments != null && !hasLoggedPayment(po.payments)) {
    return liveSchedule(po);
  }

  const hasCommitted =
    po.committed_down_payment != null ||
    po.committed_balance != null ||
    po.committed_invoice_total != null ||
    po.committed_payment_terms != null ||
    po.payment_amounts_committed_at != null;

  if (!hasCommitted) {
    return liveSchedule(po);
  }

  return scheduleFromTerms(
    live.invoiceTotal,
    committedTerms(po, live.invoiceTotal),
    true,
  );
}

export type CommittedAmountsPatch = {
  committed_down_payment: number;
  committed_balance: number;
  committed_invoice_total: number;
  committed_payment_terms: StoredPaymentTermAmount[];
  payment_amounts_committed_at: string;
};

function alreadyCommitted(po: PoWithCommitted): boolean {
  return (
    po.payment_amounts_committed_at != null ||
    po.committed_down_payment != null ||
    po.committed_balance != null ||
    po.committed_invoice_total != null ||
    po.committed_payment_terms != null
  );
}

function installmentsAtFirstPayment(
  po: PoWithCommitted,
  purpose: string,
  amount: number,
): ResolvedPaymentTerm[] {
  const live = computePoInvoiceTotals(po);
  const terms = allocatePaymentTerms(
    live.invoiceTotal,
    configuredPaymentTerms(po),
  );
  const match = paymentTermIndexForPurpose(purpose, terms);
  if (match < 0 || match >= terms.length - 1) return terms;

  const next = terms.map((term, index) =>
    index === match ? { ...term, amount: statedMoney(amount) } : { ...term },
  );
  const used = next.slice(0, -1).reduce((sum, term) => sum + term.amount, 0);
  const last = next.length - 1;
  next[last] = {
    ...next[last]!,
    amount: statedMoney(live.invoiceTotal - used),
  };
  return next;
}

function patchFromInstallments(
  terms: ResolvedPaymentTerm[],
  invoiceTotal: number,
  committedAt: string,
): CommittedAmountsPatch {
  const down = statedMoney(terms[0]?.amount ?? 0);
  return {
    committed_down_payment: down,
    committed_balance: statedMoney(invoiceTotal - down),
    committed_invoice_total: statedMoney(invoiceTotal),
    committed_payment_terms: terms.map((term) => ({
      label: term.label,
      amount: statedMoney(term.amount),
    })),
    payment_amounts_committed_at: committedAt,
  };
}

/** Freeze from live totals, overriding the purpose being logged with its actual amount. */
export function buildCommittedPatchFromPayment(
  po: PoWithCommitted,
  purpose: string,
  amount: number,
  committedAt = new Date().toISOString(),
  options?: { replaceExisting?: boolean },
): CommittedAmountsPatch | null {
  if (!options?.replaceExisting && alreadyCommitted(po)) return null;

  const live = computePoInvoiceTotals(po);
  return patchFromInstallments(
    installmentsAtFirstPayment(po, purpose, amount),
    live.invoiceTotal,
    committedAt,
  );
}

/** Freeze from live invoice totals when logging the first payment (no prior AP freeze). */
export function buildCommittedPatchFromLiveTotals(
  po: PoWithCommitted,
  committedAt = new Date().toISOString(),
): CommittedAmountsPatch | null {
  if (alreadyCommitted(po)) return null;

  const live = computePoInvoiceTotals(po);
  return patchFromInstallments(
    allocatePaymentTerms(live.invoiceTotal, configuredPaymentTerms(po)),
    live.invoiceTotal,
    committedAt,
  );
}
