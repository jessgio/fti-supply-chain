import { isValidPoCurrency } from "@/lib/procurement/currencies";

const rateCache = new Map<string, number>();

function cacheKey(currency: string, date: string): string {
  return `${date}:${currency}`;
}

interface FrankfurterDayResponse {
  rates?: { IDR?: number };
}

interface FrankfurterRangeResponse {
  rates?: Record<string, { IDR?: number }>;
}

function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve rate for date, walking back up to 7 days for weekends/holidays. */
async function fetchRateToIdrForDate(
  currency: string,
  date: string,
): Promise<number> {
  let cursor = date;
  for (let i = 0; i < 7; i++) {
    const res = await fetchWithTimeout(
      `https://api.frankfurter.dev/v1/${cursor}?from=${currency}&to=IDR`,
    );
    if (res.ok) {
      const data = (await res.json()) as FrankfurterDayResponse;
      const rate = data.rates?.IDR;
      if (typeof rate === "number" && rate > 0) return rate;
    }
    cursor = previousDay(cursor);
  }
  throw new Error(`Exchange rate unavailable for ${currency} on ${date}.`);
}

/**
 * Prefetch rates for many dates in one Frankfurter range call when possible.
 * Missing weekend/holiday days inherit the previous available rate.
 */
export async function preloadRatesToIdr(
  currency: string,
  dates: string[],
): Promise<void> {
  const code = currency.toUpperCase();
  if (code === "IDR" || dates.length === 0) return;
  if (!isValidPoCurrency(code)) {
    throw new Error(`Unsupported currency: ${code}`);
  }

  const unique = [...new Set(dates.filter(Boolean))].sort();
  const missing = unique.filter((d) => !rateCache.has(cacheKey(code, d)));
  if (missing.length === 0) return;

  if (missing.length === 1) {
    const date = missing[0]!;
    const rate = await fetchRateToIdrForDate(code, date);
    rateCache.set(cacheKey(code, date), rate);
    return;
  }

  const start = missing[0]!;
  const end = missing[missing.length - 1]!;
  // Start a few days earlier so weekend/holiday lookups have a prior rate.
  let rangeStart = start;
  for (let i = 0; i < 7; i++) rangeStart = previousDay(rangeStart);

  try {
    const res = await fetchWithTimeout(
      `https://api.frankfurter.dev/v1/${rangeStart}..${end}?from=${code}&to=IDR`,
      12000,
    );
    if (!res.ok) throw new Error(`range ${res.status}`);

    const data = (await res.json()) as FrankfurterRangeResponse;
    const byDate = data.rates ?? {};
    const sortedDays = Object.keys(byDate).sort();
    let lastRate: number | null = null;

    for (const day of sortedDays) {
      const rate = byDate[day]?.IDR;
      if (typeof rate === "number" && rate > 0) {
        lastRate = rate;
        rateCache.set(cacheKey(code, day), rate);
      }
    }

    for (const date of missing) {
      if (rateCache.has(cacheKey(code, date))) continue;
      // Walk back within the fetched window.
      let cursor = date;
      let found: number | null = null;
      for (let i = 0; i < 10; i++) {
        const cached = rateCache.get(cacheKey(code, cursor));
        if (cached !== undefined) {
          found = cached;
          break;
        }
        cursor = previousDay(cursor);
      }
      if (found != null) {
        rateCache.set(cacheKey(code, date), found);
      } else if (lastRate != null) {
        rateCache.set(cacheKey(code, date), lastRate);
      }
    }
  } catch {
    // Fall back to per-date fetches in parallel.
    await Promise.all(
      missing.map(async (date) => {
        if (rateCache.has(cacheKey(code, date))) return;
        try {
          const rate = await fetchRateToIdrForDate(code, date);
          rateCache.set(cacheKey(code, date), rate);
        } catch {
          // Leave uncached; getRateToIdr will surface the error if needed.
        }
      }),
    );
  }
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

  const rate = await fetchRateToIdrForDate(code, date);
  rateCache.set(key, rate);
  return rate;
}
