import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertExtractByItemNo } from "@/lib/db/extract-mappings";
import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";

export interface CatalogCodeRow {
  id: string;
  item_code: string;
  extract_name: string;
  extract_id?: string | null;
}

/** Ledger item_no for a catalog row; disambiguates shared codes like "-". */
export function catalogLedgerItemNo(
  itemCode: string,
  extractName: string,
  sharedItemCodeCount = 1,
): string {
  const code = itemCode.trim();
  const name = fixUtf8Mojibake(extractName.trim());
  if (!code || code === "-") return name;
  if (sharedItemCodeCount <= 1) return code;
  return `${code} — ${name}`;
}

async function countCatalogRowsWithItemCode(
  supabase: SupabaseClient,
  itemCode: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("extract_codes")
    .select("id", { count: "exact", head: true })
    .eq("item_code", itemCode);
  if (error) throw error;
  return count ?? 0;
}

async function loadSharedItemCodeCounts(
  supabase: SupabaseClient,
  itemCodes: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (itemCodes.length === 0) return counts;

  const { data, error } = await supabase
    .from("extract_codes")
    .select("item_code")
    .in("item_code", itemCodes);
  if (error) throw error;

  for (const row of data ?? []) {
    const code = row.item_code as string;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

async function ensureItemNameMapping(
  supabase: SupabaseClient,
  extractId: string,
  extractName: string,
): Promise<void> {
  const manufacturer_name = fixUtf8Mojibake(extractName.trim());
  if (!manufacturer_name) return;

  const { data: byName, error: byNameError } = await supabase
    .from("extract_item_name_mappings")
    .select("id, extract_id")
    .ilike("manufacturer_name", manufacturer_name)
    .maybeSingle();
  if (byNameError) throw byNameError;

  if (byName?.extract_id === extractId) return;

  if (byName) {
    const { error } = await supabase
      .from("extract_item_name_mappings")
      .update({ extract_id: extractId })
      .eq("id", byName.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("extract_item_name_mappings")
    .insert({ manufacturer_name, extract_id: extractId });
  if (error) throw error;
}

async function updateExtractRecord(
  supabase: SupabaseClient,
  extractId: string,
  itemNo: string,
  extractName: string,
): Promise<void> {
  const { error } = await supabase
    .from("extracts")
    .update({
      item_no: itemNo,
      description: fixUtf8Mojibake(extractName.trim()) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", extractId);
  if (error) throw error;
}

/**
 * Ensure a DN catalog row has a linked ledger extract and manufacturer mapping.
 * Returns the linked extract id.
 */
export async function syncExtractFromCatalogCode(
  supabase: SupabaseClient,
  code: CatalogCodeRow,
  sharedItemCodeCount?: number,
): Promise<string> {
  const item_code = code.item_code.trim();
  const extract_name = fixUtf8Mojibake(code.extract_name.trim());
  if (!item_code) throw new Error("Item code is required.");
  if (!extract_name) throw new Error("Extract name is required.");

  const sharedCount =
    sharedItemCodeCount ?? (await countCatalogRowsWithItemCode(supabase, item_code));
  const itemNo = catalogLedgerItemNo(item_code, extract_name, sharedCount);

  let extractId = code.extract_id ?? null;

  if (extractId) {
    const { data: linked, error: linkedError } = await supabase
      .from("extracts")
      .select("id")
      .eq("id", extractId)
      .maybeSingle();
    if (linkedError) throw linkedError;
    if (linked) {
      await updateExtractRecord(supabase, extractId, itemNo, extract_name);
      await ensureItemNameMapping(supabase, extractId, extract_name);
      await supabase
        .from("extract_codes")
        .update({ extract_id: extractId })
        .eq("id", code.id);
      return extractId;
    }
    extractId = null;
  }

  const { data: byItemNo, error: byItemNoError } = await supabase
    .from("extracts")
    .select("id")
    .eq("item_no", itemNo)
    .maybeSingle();
  if (byItemNoError) throw byItemNoError;

  if (byItemNo) {
    extractId = byItemNo.id as string;
    await updateExtractRecord(supabase, extractId, itemNo, extract_name);
  } else {
    extractId = await upsertExtractByItemNo(
      supabase,
      itemNo,
      extract_name,
    );
  }

  await ensureItemNameMapping(supabase, extractId, extract_name);

  const { error: linkError } = await supabase
    .from("extract_codes")
    .update({ extract_id: extractId })
    .eq("id", code.id);
  if (linkError) throw linkError;

  return extractId;
}

/** Backfill ledger links for catalog rows that are not linked yet. */
export async function syncUnlinkedCatalogExtracts(
  supabase: SupabaseClient,
): Promise<void> {
  const { data, error } = await supabase
    .from("extract_codes")
    .select("id, item_code, extract_name, extract_id")
    .eq("is_active", true)
    .is("extract_id", null);
  if (error) throw error;
  if (!data?.length) return;

  const itemCodes = [...new Set(data.map((row) => row.item_code as string))];
  const sharedCounts = await loadSharedItemCodeCounts(supabase, itemCodes);

  for (const row of data) {
    await syncExtractFromCatalogCode(
      supabase,
      row as CatalogCodeRow,
      sharedCounts.get(row.item_code as string) ?? 1,
    );
  }
}
