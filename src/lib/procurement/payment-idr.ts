import type { PoPayment } from "@/types/database";
import { getRateToIdr } from "@/lib/procurement/fx-rates";

type PaymentFxInput = Pick<
  PoPayment,
  "amount" | "currency" | "exchange_rate" | "payment_date"
>;

function fxCacheKey(currency: string, date: string): string {
  return `${currency.toUpperCase()}:${date}`;
}

/** Preload Frankfurter rates for unique currency/date pairs (parallel, deduped). */
export async function preloadPaymentFxRates(
  payments: PaymentFxInput[],
): Promise<Map<string, number>> {
  const needed = new Set<string>();
  for (const payment of payments) {
    const currency = payment.currency ?? "IDR";
    if (currency === "IDR") continue;
    if (payment.exchange_rate != null && payment.exchange_rate > 0) continue;
    needed.add(fxCacheKey(currency, payment.payment_date));
  }

  const rates = new Map<string, number>();
  await Promise.all(
    [...needed].map(async (key) => {
      const [currency, date] = key.split(":");
      rates.set(key, await getRateToIdr(currency, date));
    }),
  );
  return rates;
}

/** Convert using preloaded rates; falls back to stored rate or IDR. */
export function paymentAmountIdrWithRates(
  payment: PaymentFxInput,
  rates: Map<string, number>,
): number {
  if (payment.currency === "IDR") {
    return Math.round(payment.amount);
  }
  if (payment.exchange_rate != null && payment.exchange_rate > 0) {
    return Math.round(payment.amount * payment.exchange_rate);
  }
  const rate = rates.get(
    fxCacheKey(payment.currency, payment.payment_date),
  );
  if (rate == null) {
    throw new Error(
      `Missing FX rate for ${payment.currency} on ${payment.payment_date}`,
    );
  }
  return Math.round(payment.amount * rate);
}

/** Convert a logged payment to IDR using the recorded rate or an FX fallback. */
export async function paymentAmountIdr(
  payment: PaymentFxInput,
): Promise<number> {
  const sync = paymentAmountIdrSync(payment);
  if (sync !== null) return sync;
  const rates = await preloadPaymentFxRates([payment]);
  return paymentAmountIdrWithRates(payment, rates);
}

export function paymentAmountIdrSync(
  payment: Pick<PoPayment, "amount" | "currency" | "exchange_rate">,
): number | null {
  if (payment.currency === "IDR") {
    return Math.round(payment.amount);
  }
  if (payment.exchange_rate != null && payment.exchange_rate > 0) {
    return Math.round(payment.amount * payment.exchange_rate);
  }
  return null;
}
