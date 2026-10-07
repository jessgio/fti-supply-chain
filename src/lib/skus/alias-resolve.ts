export interface SkuAliasLink {
  alias_sku_id: string;
  canonical_sku_id: string;
}

export interface SkuAliasRecord {
  alias_sku_id: string;
  alias_sku_code: string;
  alias_name: string | null;
  canonical_sku_id: string;
  canonical_sku_code: string;
  canonical_name: string | null;
}

export interface ResolvedStockQty {
  sku_id: string;
  location: string;
  as_of_date: string;
  qty_on_hand: number;
}

/**
 * A stock file can list both the pre-order code and the regular code for the
 * same location and date. After those codes resolve to one SKU, sum them so
 * the snapshot upsert does not write the same key twice.
 */
export function sumStockQtyBySkuLocationDate<T extends ResolvedStockQty>(
  rows: readonly T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.sku_id}|${row.location}|${row.as_of_date}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty_on_hand += row.qty_on_hand;
    } else {
      map.set(key, { ...row });
    }
  }
  return [...map.values()];
}

/** Rewrite resolved SKU ids so an alias code stores against the canonical SKU. */
export function remapSkuIdsToCanonical(
  cache: Map<string, string>,
  aliases: readonly SkuAliasLink[],
): void {
  if (aliases.length === 0 || cache.size === 0) return;

  const canonicalByAlias = new Map(
    aliases.map((alias) => [alias.alias_sku_id, alias.canonical_sku_id]),
  );

  for (const [code, skuId] of cache) {
    const canonicalId = canonicalByAlias.get(skuId);
    if (canonicalId && canonicalId !== skuId) {
      cache.set(code, canonicalId);
    }
  }
}

/**
 * Reject self-aliases and chains. One pre-order SKU maps to one regular SKU,
 * and that regular SKU is not itself an alias.
 */
export function aliasAssignmentError(
  aliasSkuId: string,
  canonicalSkuId: string,
  existing: readonly SkuAliasLink[],
): string | null {
  if (!aliasSkuId || !canonicalSkuId) {
    return "Choose both the pre-order SKU and the regular SKU.";
  }
  if (aliasSkuId === canonicalSkuId) {
    return "A SKU cannot alias itself.";
  }

  const canonicalIsAlias = existing.some(
    (link) =>
      link.alias_sku_id === canonicalSkuId &&
      link.alias_sku_id !== aliasSkuId,
  );
  if (canonicalIsAlias) {
    return "The canonical SKU is itself an alias. Choose the regular SKU it points to.";
  }

  const aliasIsCanonical = existing.some(
    (link) =>
      link.canonical_sku_id === aliasSkuId &&
      link.alias_sku_id !== aliasSkuId,
  );
  if (aliasIsCanonical) {
    return "Other SKUs already alias onto this pre-order SKU. Point those at the regular SKU first.";
  }

  return null;
}
