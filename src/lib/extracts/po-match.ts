/** Normalize PO / order numbers for fuzzy matching. */
export function normalizePoReference(value: string): string {
  return value.trim().replace(/^po\s+/i, "").toLowerCase();
}

export function orderNoMatchesPo(
  orderNo: string | null | undefined,
  poNumber: string,
): boolean {
  if (!orderNo?.trim() || !poNumber.trim()) return false;
  const order = normalizePoReference(orderNo);
  const po = normalizePoReference(poNumber);
  return order === po || order.includes(po) || po.includes(order);
}
