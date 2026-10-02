/**
 * PostgREST sends `.in()` filters in the URL. Large id/code lists overflow
 * the header limit and fail the request, and each response is capped at
 * 1000 rows. Callers should page with `fetchAllRows` inside `load` when one
 * chunk can still return more than 1000 rows.
 */
export const ID_IN_CHUNK = 100;

/** SKU codes vary in length; keep each filter URL comfortably under the limit. */
export const CODE_IN_CHUNK = 80;

const CHUNK_CONCURRENCY = 4;

export async function queryInChunks<T>(
  values: readonly string[],
  chunkSize: number,
  load: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  if (unique.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const all: T[] = [];
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const parts = await Promise.all(batch.map((chunk) => load(chunk)));
    for (const part of parts) all.push(...part);
  }
  return all;
}
