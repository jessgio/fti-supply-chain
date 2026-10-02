/** Sidebar badge. Avoids recounting unclassified SKUs on every navigation. */
export const UNCLASSIFIED_COUNT_TTL_MS = 60_000;

let cache: { count: number; at: number } | null = null;

export function readUnclassifiedCountCache(): number | null {
  if (!cache) return null;
  if (Date.now() - cache.at > UNCLASSIFIED_COUNT_TTL_MS) return null;
  return cache.count;
}

export function writeUnclassifiedCountCache(count: number) {
  cache = { count, at: Date.now() };
}
