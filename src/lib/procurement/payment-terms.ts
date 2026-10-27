import { preserveFractionalMoney } from "@/lib/procurement/currencies";

/** Enough for a down payment, two progress payments, and a final payment. */
export const MAX_PAYMENT_TERMS = 6;

export const DEFAULT_DOWN_PAYMENT_LABEL = "Down payment";
export const DEFAULT_FINAL_PAYMENT_LABEL = "Final payment";

export type PaymentTermDraft = {
  label: string;
  pct: number;
};

export type ResolvedPaymentTerm = {
  label: string;
  /** Percent printed on the invoice for this installment. */
  pct: number;
  amount: number;
  /** Percent configured on the purchase order. */
  configuredPct: number;
};

export type StoredPaymentTermAmount = {
  label: string;
  amount: number;
};

/** Format a payment split for labels, e.g. 30 or 27.5. */
export function formatPaymentPct(pct: number): string {
  if (!Number.isFinite(pct)) return "0";
  const rounded = Math.round(pct * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function paymentTermLabel(term: { label: string; pct: number }): string {
  return `${term.label} (${formatPaymentPct(term.pct)}%)`;
}

export function normalizePaymentLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

export function defaultPaymentTerms(downPct = 30): PaymentTermDraft[] {
  const down = clampPct(downPct);
  return [
    { label: DEFAULT_DOWN_PAYMENT_LABEL, pct: down },
    { label: DEFAULT_FINAL_PAYMENT_LABEL, pct: roundPct(100 - down) },
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
    const pct = Number(row.pct);
    if (!label || !Number.isFinite(pct)) return null;
    terms.push({ label, pct });
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

export function validatePaymentTerms(terms: PaymentTermDraft[]): string | null {
  if (terms.length < 1) return "Add at least one payment.";
  if (terms.length > MAX_PAYMENT_TERMS) {
    return `A purchase order can have at most ${MAX_PAYMENT_TERMS} payments.`;
  }

  const seen = new Set<string>();
  let sum = 0;
  for (const term of terms) {
    const label = term.label.trim();
    if (!label) return "Each payment needs a name.";
    if (label.length > 40) return "Payment names must be 40 characters or fewer.";
    const key = normalizePaymentLabel(label);
    if (seen.has(key)) return "Payment names must be different.";
    seen.add(key);
    if (!Number.isFinite(term.pct)) return "Enter a percent for each payment.";
    if (term.pct < 0 || term.pct > 100) {
      return "Each payment percent must be between 0 and 100.";
    }
    sum += term.pct;
  }

  if (Math.abs(sum - 100) > 0.05) {
    return `Payment percents must add up to 100% (currently ${formatPaymentPct(sum)}%).`;
  }
  return null;
}

export function normalizePaymentTerms(terms: PaymentTermDraft[]): PaymentTermDraft[] {
  return terms.map((term) => ({
    label: term.label.trim(),
    pct: roundPct(term.pct),
  }));
}

/** Accepts the JSON stored on a purchase order, or null when it should fall back. */
export function normalizePaymentTermsInput(value: unknown): {
  terms: PaymentTermDraft[] | null;
  error: string | null;
} {
  if (value == null) return { terms: null, error: null };
  const parsed = parsePaymentTerms(value);
  if (!parsed) {
    return {
      terms: null,
      error: "Payment terms must be a list of named percentages.",
    };
  }
  const error = validatePaymentTerms(parsed);
  if (error) return { terms: null, error };
  return { terms: normalizePaymentTerms(parsed), error: null };
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
 * Split an invoice across the configured percents.
 * Every installment except the last is that percent of the invoice.
 * The last installment is whatever is left, so the amounts add up to the invoice.
 */
export function allocatePaymentTerms(
  invoiceTotal: number,
  terms: PaymentTermDraft[],
  options?: { useConfiguredPercents?: boolean },
): ResolvedPaymentTerm[] {
  const total = Number.isFinite(invoiceTotal) ? invoiceTotal : 0;
  const useConfigured = options?.useConfiguredPercents !== false;
  let allocated = 0;
  return terms.map((term, index) => {
    const isLast = index === terms.length - 1;
    const amount = isLast
      ? preserveFractionalMoney(total - allocated)
      : preserveFractionalMoney((total * term.pct) / 100);
    if (!isLast) allocated += amount;
    const share = total > 0 ? (amount / total) * 100 : term.pct;
    return {
      label: term.label,
      pct: useConfigured ? term.pct : share,
      amount,
      configuredPct: term.pct,
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
