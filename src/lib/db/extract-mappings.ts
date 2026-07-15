import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractActionCodeMapping,
  ExtractCategory,
  ExtractItemNameMapping,
} from "@/types/database";

/** Manufacturer item names keyed by extract id (multiple names joined with ", "). */
export async function loadManufacturerNamesByExtractId(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("extract_item_name_mappings")
    .select("extract_id, manufacturer_name")
    .order("manufacturer_name");
  if (error) throw error;

  const byExtract = new Map<string, string[]>();
  for (const row of data ?? []) {
    const extractId = row.extract_id as string;
    const name = row.manufacturer_name as string;
    const list = byExtract.get(extractId) ?? [];
    list.push(name);
    byExtract.set(extractId, list);
  }

  const result = new Map<string, string>();
  for (const [extractId, names] of byExtract) {
    result.set(extractId, names.join(", "));
  }
  return result;
}

export async function loadActionCodeMappings(
  supabase: SupabaseClient,
): Promise<ExtractActionCodeMapping[]> {
  const { data, error } = await supabase
    .from("extract_action_code_mappings")
    .select("id, action_code, category, created_at")
    .order("action_code");
  if (error) throw error;
  return (data ?? []) as ExtractActionCodeMapping[];
}

export async function createActionCodeMapping(
  supabase: SupabaseClient,
  input: { action_code: string; category: ExtractCategory },
): Promise<ExtractActionCodeMapping> {
  const action_code = input.action_code.trim();
  if (!action_code) throw new Error("Action code is required.");

  const { data, error } = await supabase
    .from("extract_action_code_mappings")
    .insert({ action_code, category: input.category })
    .select("id, action_code, category, created_at")
    .single();
  if (error) throw error;
  return data as ExtractActionCodeMapping;
}

export async function updateActionCodeMapping(
  supabase: SupabaseClient,
  id: string,
  input: { action_code?: string; category?: ExtractCategory },
): Promise<ExtractActionCodeMapping> {
  const patch: Record<string, unknown> = {};
  if (input.action_code !== undefined) {
    const action_code = input.action_code.trim();
    if (!action_code) throw new Error("Action code is required.");
    patch.action_code = action_code;
  }
  if (input.category !== undefined) patch.category = input.category;

  const { data, error } = await supabase
    .from("extract_action_code_mappings")
    .update(patch)
    .eq("id", id)
    .select("id, action_code, category, created_at")
    .single();
  if (error) throw error;
  return data as ExtractActionCodeMapping;
}

export async function deleteActionCodeMapping(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("extract_action_code_mappings")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export interface ItemNameMappingRow extends ExtractItemNameMapping {
  item_no: string;
  description: string | null;
}

export async function loadItemNameMappings(
  supabase: SupabaseClient,
): Promise<ItemNameMappingRow[]> {
  const { data, error } = await supabase
    .from("extract_item_name_mappings")
    .select(
      "id, manufacturer_name, extract_id, created_at, extracts(item_no, description)",
    )
    .order("manufacturer_name");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const extract = row.extracts as unknown as
      | { item_no: string; description: string | null }
      | { item_no: string; description: string | null }[]
      | null;
    const ex = Array.isArray(extract) ? extract[0] : extract;
    return {
      id: row.id as string,
      manufacturer_name: row.manufacturer_name as string,
      extract_id: row.extract_id as string,
      created_at: row.created_at as string,
      item_no: ex?.item_no ?? "",
      description: ex?.description ?? null,
    };
  });
}

export async function upsertExtractByItemNo(
  supabase: SupabaseClient,
  itemNo: string,
  description?: string | null,
): Promise<string> {
  const item_no = itemNo.trim();
  if (!item_no) throw new Error("Item No is required.");

  const { data, error } = await supabase
    .from("extracts")
    .upsert(
      {
        item_no,
        description: description?.trim() || null,
        unit: "kg",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_no" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
