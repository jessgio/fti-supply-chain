import type { SupabaseClient } from "@supabase/supabase-js";
import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";

export type PackagingCatalogTable =
  | "secondary_packaging_inbound_cosmax"
  | "primary_packaging_inbound_cosmax";

export const PACKAGING_CATALOG_SELECT =
  "id, item_code, product_name, is_active, created_at";

export interface PackagingCatalogItem {
  id: string;
  item_code: string;
  product_name: string;
  is_active: boolean;
  created_at: string;
}

export interface CreatePackagingCatalogItemInput {
  item_code: string;
  product_name: string;
}

export interface UpdatePackagingCatalogItemInput {
  item_code?: string;
  product_name?: string;
  is_active?: boolean;
}

export interface PackagingCatalogImportRow {
  item_code: string;
  product_name: string;
}

export interface PackagingCatalogImportResult {
  inserted: number;
  updated: number;
  total: number;
}

export function normalizePackagingItemCode(code: string): string {
  return code.trim().toUpperCase();
}

export function assertPackagingItemCode(code: string): string {
  const item_code = normalizePackagingItemCode(code);
  if (item_code.length !== 12) {
    throw new Error("Item code must be exactly 12 characters.");
  }
  return item_code;
}

export async function listPackagingCatalogItems(
  supabase: SupabaseClient,
  table: PackagingCatalogTable,
  activeOnly = true,
): Promise<PackagingCatalogItem[]> {
  let query = supabase
    .from(table)
    .select(PACKAGING_CATALOG_SELECT)
    .order("item_code");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PackagingCatalogItem[];
}

export async function createPackagingCatalogItem(
  supabase: SupabaseClient,
  table: PackagingCatalogTable,
  input: CreatePackagingCatalogItemInput,
): Promise<PackagingCatalogItem> {
  const item_code = assertPackagingItemCode(input.item_code);
  const product_name = fixUtf8Mojibake(input.product_name.trim());
  if (!product_name) {
    throw new Error("Product name is required.");
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ item_code, product_name })
    .select(PACKAGING_CATALOG_SELECT)
    .single();
  if (error) throw error;
  return data as PackagingCatalogItem;
}

export async function updatePackagingCatalogItem(
  supabase: SupabaseClient,
  table: PackagingCatalogTable,
  id: string,
  input: UpdatePackagingCatalogItemInput,
): Promise<PackagingCatalogItem> {
  const patch: Record<string, unknown> = {};
  if (input.item_code !== undefined) {
    patch.item_code = assertPackagingItemCode(input.item_code);
  }
  if (input.product_name !== undefined) {
    const product_name = fixUtf8Mojibake(input.product_name.trim());
    if (!product_name) throw new Error("Product name is required.");
    patch.product_name = product_name;
  }
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .select(PACKAGING_CATALOG_SELECT)
    .single();
  if (error) throw error;
  return data as PackagingCatalogItem;
}

export async function importPackagingCatalogRows(
  supabase: SupabaseClient,
  table: PackagingCatalogTable,
  rows: PackagingCatalogImportRow[],
): Promise<PackagingCatalogImportResult> {
  if (rows.length === 0) {
    throw new Error("No valid rows to import.");
  }

  const codes = rows.map((row) => row.item_code);
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select("item_code")
    .in("item_code", codes);
  if (existingError) throw existingError;

  const existingCodes = new Set((existing ?? []).map((row) => row.item_code as string));

  const { error } = await supabase.from(table).upsert(
    rows.map((row) => ({
      item_code: row.item_code,
      product_name: row.product_name,
      is_active: true,
    })),
    { onConflict: "item_code" },
  );
  if (error) throw error;

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    if (existingCodes.has(row.item_code)) updated += 1;
    else inserted += 1;
  }

  return { inserted, updated, total: rows.length };
}
