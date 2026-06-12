import { isValidPoCurrency } from "@/lib/procurement/currencies";

const rateCache = new Map<string, number>();

function cacheKey(currency: string, date: string): string {
  return `${date}:${currency}`;
}

interface FrankfurterResponse {
  rates?: { IDR?: number };
}

export async function getRateToIdr(
  currency: string,
  date: string,
): Promise<number> {
  const code = currency.toUpperCase();
  if (code === "IDR") return 1;
  if (!isValidPoCurrency(code)) {
    throw new Error(`Unsupported currency: ${code}`);
  }

  const key = cacheKey(code, date);
  const cached = rateCache.get(key);
  if (cached !== undefined) return cached;

  const res = await fetch(
    `https://api.frankfurter.dev/v1/${date}?from=${code}&to=IDR`,
  );
  if (!res.ok) {
    throw new Error(
      `Exchange rate unavailable for ${code} on ${date} (${res.status}).`,
    );
  }

  const data = (await res.json()) as FrankfurterResponse;
  const rate = data.rates?.IDR;
  if (typeof rate !== "number" || rate <= 0) {
    throw new Error(`Exchange rate unavailable for ${code} on ${date}.`);
  }

  rateCache.set(key, rate);
  return rate;
}
