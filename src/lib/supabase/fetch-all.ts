import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

type QueryBuilder<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<QueryResult<T>> | QueryResult<T>;
};

export async function fetchAllRows<T>(
  buildQuery: () => QueryBuilder<T>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery().range(
      offset,
      offset + PAGE_SIZE - 1,
    );
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

export async function fetchAllRpc<T>(
  supabase: SupabaseClient,
  fn: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .rpc(fn, params)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}
