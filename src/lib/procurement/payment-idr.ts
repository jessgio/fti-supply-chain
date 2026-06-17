import type { PoPayment } from "@/types/database";
import { getRateToIdr } from "@/lib/procurement/fx-rates";

/** Convert a logged payment to IDR using the recorded rate or an FX fallback. */
export async function paymentAmountIdr(
  payment: Pick<PoPayment, "amount" | "currency" | "exchange_rate" | "payment_date">,
): Promise<number> {
  if (payment.currency === "IDR") {
    return Math.round(payment.amount);
  }
  if (payment.exchange_rate != null && payment.exchange_rate > 0) {
    return Math.round(payment.amount * payment.exchange_rate);
  }
  const rate = await getRateToIdr(payment.currency, payment.payment_date);
  return Math.round(payment.amount * rate);
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
