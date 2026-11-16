import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";

export interface ExtractCatalogPresence {
  item_code: string;
  extract_name: string;
  extract_id: string | null;
  is_active: boolean;
}

export interface ExtractLedgerPresence {
  id: string;
  item_no: string;
}

export interface ExtractSkuCatalogKey {
  itemCode: string;
  extractName: string;
}

function norm(value: string): string {
  return fixUtf8Mojibake(value).trim().toLowerCase();
}

/** Item code and display name used when a product extract joins the catalog. */
export function extractSkuCatalogKey(sku: {
  sku_code: string;
  name: string | null;
}): ExtractSkuCatalogKey | null {
  const itemCode = sku.sku_code.trim();
  if (!itemCode) return null;
  const extractName = fixUtf8Mojibake((sku.name ?? "").trim() || itemCode);
  if (!extractName) return null;
  return { itemCode, extractName };
}

/**
 * The Extracts list is the active Extract Catalog. Products only sets
 * `skus.is_extract`, so a product marked Extract is missing from that list
 * until it has its own catalog row.
 *
 * Ledger extracts already have SKUs from the catalog sync and the original
 * backfill. Those stay out of the list until someone adds them in the
 * catalog — this only covers a product that is not a ledger item yet.
 */
export function extractSkuNeedsCatalogRow(
  sku: { sku_code: string; name: string | null },
  codes: ExtractCatalogPresence[],
  extracts: ExtractLedgerPresence[],
): boolean {
  const key = extractSkuCatalogKey(sku);
  if (!key) return false;

  const codeKey = norm(key.itemCode);
  const nameKey = norm(key.extractName);
  const active = codes.filter((code) => code.is_active);

  if (active.some((code) => norm(code.item_code) === codeKey)) return false;
  if (active.some((code) => norm(code.extract_name) === nameKey)) return false;

  if (extracts.some((row) => norm(row.item_no) === codeKey)) return false;

  const retired = codes.some(
    (code) =>
      !code.is_active &&
      norm(code.item_code) === codeKey &&
      norm(code.extract_name) === nameKey,
  );
  if (retired) return false;

  return true;
}
