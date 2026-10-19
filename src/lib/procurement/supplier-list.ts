const NAME_SORT: Intl.CollatorOptions = { sensitivity: "base", numeric: true };

export function compareSupplierNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, NAME_SORT);
}

export function sortSuppliersByName<T extends { name: string }>(
  suppliers: readonly T[],
): T[] {
  return [...suppliers].sort((a, b) => compareSupplierNames(a.name, b.name));
}

/** Alphabetical matches for a typed supplier name. Empty query returns every supplier. */
export function suppliersMatchingName<T extends { name: string }>(
  suppliers: readonly T[],
  query: string,
): T[] {
  const sorted = sortSuppliersByName(suppliers);
  const q = query.trim().toLowerCase();
  if (!q) return sorted;
  return sorted.filter((supplier) => supplier.name.toLowerCase().includes(q));
}
