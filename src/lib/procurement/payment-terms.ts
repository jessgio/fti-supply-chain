import { preserveFractionalMoney } from "@/lib/procurement/currencies";

/** Enough for a down payment, two progress payments, and a final payment. */
export const MAX_PAYMENT_TERMS = 6;

export const DEFAULT_DOWN_PAYMENT_LABEL = "Down payment";
export const DEFAULT_FINAL_PAYMENT_LABEL = "Final payment";

export type PaymentTermBasis = "pct" | "amount";

export type PaymentTermDraft = {
  label: string;
  /** Configured percent. For a fixed amount this is only a sort hint. */
  pct: number;
  /**
   * How this installment is entered. Missing means percent, so older rows
   * stay percent terms.
   */
  basis?: PaymentTermBasis;
  /** Fixed amount when basis is "amount". */
  amount?: number | null;
};

export type ResolvedPaymentTerm = {
  label: string;
  /** Percent printed on the invoice when this installment was entered as a percent. */
  pct: number;
  amount: number;
  /** Percent configured on the purchase order. */
  configuredPct: number;
  basis: PaymentTermBasis;
  /** This installment is whatever is left after the fixed amounts. */
  remainder: boolean;
};

export type StoredPaymentTermAmount = {
  label: string;
  amount: number;
};

export type PaymentTermsCheck = {
  invoiceTotal?: number;
  currency?: string;
};

/** Format a payment split for labels, e.g. 30 or 27.5. */
export function formatPaymentPct(pct: number): string {
  if (!Number.isFinite(pct)) return "0";
  const rounded = Math.round(pct * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function paymentTermBasis(term: { basis?: PaymentTermBasis | null }): PaymentTermBasis {
  return term.basis === "amount" ? "amount" : "pct";
}

export function paymentTermLabel(term: {
  label: string;
  pct: number;
  basis?: PaymentTermBasis;
  remainder?: boolean;
}): string {
  if (term.basis === "amount" || term.remainder) return term.label;
  return `${term.label} (${formatPaymentPct(term.pct)}%)`;
}

export function normalizePaymentLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Same bands as poCurrencyTolerance. Kept here so payment-term checks do not
 * import the payment summary (that module already depends on this one).
 */
function moneyTolerance(currency?: string): number {
  if (currency === "IDR" || currency === "JPY" || currency === "KRW" || !currency) {
    return 1;
  }
  return 0.01;
}

export function defaultPaymentTerms(downPct = 30): PaymentTermDraft[] {
  const down = clampPct(downPct);
  return [
    { label: DEFAULT_DOWN_PAYMENT_LABEL, pct: down, basis: "pct" },
    { label: DEFAULT_FINAL_PAYMENT_LABEL, pct: roundPct(100 - down), basis: "pct" },
  ];
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return roundPct(Math.min(100, Math.max(0, value)));
}

export function ordinalPaymentLabel(index: number, count: number): string {
  if (count <= 1 || index === 0) return DEFAULT_DOWN_PAYMENT_LABEL;
  if (index === count - 1) return DEFAULT_FINAL_PAYMENT_LABEL;
  const position = index + 1;
  return `${position}${ordinalSuffix(position)} payment`;
}

function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function parsePaymentTerms(value: unknown): PaymentTermDraft[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const terms: PaymentTermDraft[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) return null;
    const basis = row.basis === "amount" ? "amount" : "pct";
    const pct = Number(row.pct);
    if (basis === "amount") {
      const amount = Number(row.amount);
      if (!Number.isFinite(amount)) return null;
      terms.push({
        label,
        basis: "amount",
        amount,
        pct: Number.isFinite(pct) ? pct : 0,
      });
      continue;
    }
    if (!Number.isFinite(pct)) return null;
    terms.push({ label, basis: "pct", pct });
  }
  return terms;
}

export function parseCommittedPaymentTerms(
  value: unknown,
): StoredPaymentTermAmount[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const terms: StoredPaymentTermAmount[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const amount = Number(row.amount);
    if (!label || !Number.isFinite(amount)) return null;
    terms.push({ label, amount });
  }
  return terms;
}

/**
 * Index of the installment that takes whatever is left of the invoice.
 * Percent-only schedules use the last term. A fixed amount keeps its number,
 * and the last percent term is the remainder. -1 when every term is an amount.
 */
export function balanceTermIndex(
  terms: Array<{ basis?: PaymentTermBasis | null }>,
): number {
  if (!terms.some((term) => paymentTermBasis(term) === "amount")) {
    return terms.length > 0 ? terms.length - 1 : -1;
  }
  for (let index = terms.length - 1; index >= 0; index -= 1) {
    if (paymentTermBasis(terms[index]!) !== "amount") return index;
  }
  return -1;
}

/** Installment that absorbs invoice changes once a payment is logged. */
export function absorbingTermIndex(
  terms: Array<{ basis?: PaymentTermBasis | null }>,
): number {
  const plug = balanceTermIndex(terms);
  if (plug >= 0) return plug;
  return Math.max(terms.length - 1, 0);
}

export function validatePaymentTerms(
  terms: PaymentTermDraft[],
  check?: PaymentTermsCheck,
): string | null {
  if (terms.length < 1) return "Add at least one payment.";
  if (terms.length > MAX_PAYMENT_TERMS) {
    return `A purchase order can have at most ${MAX_PAYMENT_TERMS} payments.`;
  }

  const seen = new Set<string>();
  const hasAmount = terms.some((term) => paymentTermBasis(term) === "amount");
  const plug = balanceTermIndex(terms);
  let sum = 0;
  for (const [index, term] of terms.entries()) {
    const label = term.label.trim();
    if (!label) return "Each payment needs a name.";
    if (label.length > 40) return "Payment names must be 40 characters or fewer.";
    const key = normalizePaymentLabel(label);
    if (seen.has(key)) return "Payment names must be different.";
    seen.add(key);

    if (paymentTermBasis(term) === "amount") {
      if (term.amount == null || !Number.isFinite(term.amount) || term.amount < 0) {
        return "Enter an amount for each fixed payment.";
      }
      continue;
    }

    if (hasAmount && index === plug) continue;
    if (!Number.isFinite(term.pct)) return "Enter a percent for each payment.";
    if (term.pct < 0 || term.pct > 100) {
      return "Each payment percent must be between 0 and 100.";
    }
    sum += term.pct;
  }

  if (!hasAmount && Math.abs(sum - 100) > 0.05) {
    return `Payment percents must add up to 100% (currently ${formatPaymentPct(sum)}%).`;
  }

  const invoiceTotal = check?.invoiceTotal;
  if (hasAmount && invoiceTotal != null && Number.isFinite(invoiceTotal)) {
    const tolerance = moneyTolerance(check?.currency);
    const allocated = allocatePaymentTerms(invoiceTotal, terms);
    if (plug < 0) {
      const amountSum = allocated.reduce((total, term) => total + term.amount, 0);
      if (Math.abs(amountSum - invoiceTotal) > tolerance) {
        return "Fixed payments must add up to the invoice.";
      }
    } else if ((allocated[plug]?.amount ?? 0) < -tolerance) {
      return "Fixed payments are larger than the invoice.";
    }
  }
  return null;
}

export function normalizePaymentTerms(
  terms: PaymentTermDraft[],
  invoiceTotal?: number,
): PaymentTermDraft[] {
  const allocated =
    invoiceTotal != null && Number.isFinite(invoiceTotal)
      ? allocatePaymentTerms(invoiceTotal, terms)
      : null;
  const plug = balanceTermIndex(terms);
  const hasAmount = terms.some((term) => paymentTermBasis(term) === "amount");
  return terms.map((term, index) => {
    const basis = paymentTermBasis(term);
    const share = allocated?.[index]?.pct;
    const sharePct = Number.isFinite(share) ? roundPct(share!) : 0;
    if (basis === "amount") {
      return {
        label: term.label.trim(),
        basis: "amount" as const,
        amount: preserveFractionalMoney(term.amount ?? 0),
        pct: allocated ? sharePct : roundPct(Number.isFinite(term.pct) ? term.pct : 0),
      };
    }
    const configured = Number.isFinite(term.pct) ? roundPct(term.pct) : sharePct;
    return {
      label: term.label.trim(),
      basis: "pct" as const,
      pct: hasAmount && index === plug ? (allocated ? sharePct : configured) : configured,
    };
  });
}

/** Accepts the JSON stored on a purchase order, or null when it should fall back. */
export function normalizePaymentTermsInput(
  value: unknown,
  check?: PaymentTermsCheck,
): {
  terms: PaymentTermDraft[] | null;
  error: string | null;
} {
  if (value == null) return { terms: null, error: null };
  const parsed = parsePaymentTerms(value);
  if (!parsed) {
    return {
      terms: null,
      error: "Payment terms must be a list of named payments.",
    };
  }
  const error = validatePaymentTerms(parsed, check);
  if (error) return { terms: null, error };
  return { terms: normalizePaymentTerms(parsed, check?.invoiceTotal), error: null };
}

export function configuredPaymentTerms(po: {
  down_payment_pct?: number | null;
  payment_terms?: unknown;
}): PaymentTermDraft[] {
  const parsed = parsePaymentTerms(po.payment_terms);
  if (parsed && validatePaymentTerms(parsed) == null) {
    return normalizePaymentTerms(parsed);
  }
  return defaultPaymentTerms(po.down_payment_pct ?? 30);
}

/**
 * Split an invoice across the payment terms.
 * A percent is that share of the invoice. A fixed amount stays exact.
 * One percent term, usually the last, is whatever is left so the amounts
 * add up to the invoice. When every term is a fixed amount, nothing is rewritten.
 */
export function allocatePaymentTerms(
  invoiceTotal: number,
  terms: PaymentTermDraft[],
  options?: { useConfiguredPercents?: boolean },
): ResolvedPaymentTerm[] {
  const total = Number.isFinite(invoiceTotal) ? invoiceTotal : 0;
  const useConfigured = options?.useConfiguredPercents !== false;
  const hasAmount = terms.some((term) => paymentTermBasis(term) === "amount");
  const plug = hasAmount ? balanceTermIndex(terms) : terms.length - 1;
  const amounts = terms.map((term, index) => {
    if (plug >= 0 && index === plug) return 0;
    if (paymentTermBasis(term) === "amount") {
      return preserveFractionalMoney(term.amount ?? 0);
    }
    return preserveFractionalMoney((total * term.pct) / 100);
  });
  if (plug >= 0) {
    const used = amounts.reduce(
      (sum, amount, index) => (index === plug ? sum : sum + amount),
      0,
    );
    amounts[plug] = preserveFractionalMoney(total - used);
  }

  return terms.map((term, index) => {
    const amount = amounts[index] ?? 0;
    const share = total > 0 ? (amount / total) * 100 : term.pct;
    const basis = paymentTermBasis(term);
    const remainder = hasAmount && index === plug;
    return {
      label: term.label,
      pct: useConfigured && basis === "pct" && !remainder ? term.pct : share,
      amount,
      configuredPct:
        basis === "pct" && Number.isFinite(term.pct) && !remainder ? term.pct : share,
      basis,
      remainder,
    };
  });
}

const LEGACY_FINAL_LABELS = new Set([
  "final payment",
  "balance payment",
  "balance",
]);

/**
 * Which installment a logged purpose belongs to.
 * An exact name wins. "Balance payment" still counts as the final payment
 * when that installment is still named Final payment.
 */
export function paymentTermIndexForPurpose(
  purpose: string,
  terms: Array<{ label: string }>,
): number {
  const purposeKey = normalizePaymentLabel(purpose);
  if (!purposeKey || terms.length === 0) return -1;

  const exact = terms.findIndex(
    (term) => normalizePaymentLabel(term.label) === purposeKey,
  );
  if (exact >= 0) return exact;

  if (purposeKey === "down payment") {
    return terms.findIndex(
      (term) => normalizePaymentLabel(term.label) === "down payment",
    );
  }

  if (purposeKey === "balance payment" || purposeKey === "final payment") {
    const last = terms.length - 1;
    const label = normalizePaymentLabel(terms[last]?.label ?? "");
    if (LEGACY_FINAL_LABELS.has(label)) return last;
  }

  return -1;
}

export function purposeMatchesPaymentTerm(
  purpose: string,
  index: number,
  terms: Array<{ label: string }>,
): boolean {
  return paymentTermIndexForPurpose(purpose, terms) === index;
}

const EXTRA_PAYMENT_PURPOSES = ["Shipping", "Fee", "Tax", "Other"] as const;

/** Term names first, then costs that are not part of the invoice split. */
export function paymentPurposeChoices(termLabels: string[]): string[] {
  const seen = new Set(termLabels.map((label) => normalizePaymentLabel(label)));
  const extras = EXTRA_PAYMENT_PURPOSES.filter(
    (purpose) => !seen.has(normalizePaymentLabel(purpose)),
  );
  return [...termLabels, ...extras];
}
