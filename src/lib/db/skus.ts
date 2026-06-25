import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";

export interface CreateSkuInput {
  sku_code: string;
  name?: string | null;
  franchise_id?: string | null;
  franchise_name?: string | null;
  is_bundle?: boolean;
  retail_price?: number | null;
}

export interface CreatedSkuRow {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_active: boolean;
  franchise_id: string | null;
  franchise_name: string | null;
}

async function resolveFranchiseId(
  supabase: SupabaseClient,
  franchiseId?: string | null,
  franchiseName?: string | null,
): Promise<string | null> {
  if (franchiseId) return franchiseId;

  const name = franchiseName?.trim();
  if (!name) return null;

  const slug = slugify(name);
  if (!slug) {
    throw new Error("Franchise name is invalid.");
  }

  const { data: existing, error: lookupError } = await supabase
    .from("product_franchises")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("product_franchises")
    .insert({ name, slug })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function createSku(
  supabase: SupabaseClient,
  input: CreateSkuInput,
): Promise<CreatedSkuRow> {
  const skuCode = input.sku_code.trim();
  if (!skuCode) {
    throw new Error("SKU code is required.");
  }

  const isBundle = Boolean(input.is_bundle);
  if (isBundle && (input.franchise_id || input.franchise_name?.trim())) {
    throw new Error("Bundle SKUs cannot be assigned to a franchise.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("skus")
    .select("id, sku_code")
    .eq("sku_code", skuCode)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new Error(`SKU already exists: ${skuCode}`);
  }

  const franchiseId = isBundle
    ? null
    : await resolveFranchiseId(
        supabase,
        input.franchise_id,
        input.franchise_name,
      );

  const name = input.name?.trim() || skuCode;
  const retailPrice =
    input.retail_price != null && input.retail_price > 0
      ? input.retail_price
      : null;

  const { data, error } = await supabase
    .from("skus")
    .insert({
      sku_code: skuCode,
      name,
      franchise_id: franchiseId,
      is_bundle: isBundle,
      is_active: true,
      retail_price: retailPrice,
    })
    .select(
      "id, sku_code, name, is_bundle, is_active, franchise_id, product_franchises(name)",
    )
    .single();

  if (error) throw error;

  const franchise = data.product_franchises as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const franchiseName = Array.isArray(franchise)
    ? (franchise[0]?.name ?? null)
    : (franchise?.name ?? null);

  return {
    id: data.id,
    sku_code: data.sku_code,
    name: data.name,
    is_bundle: data.is_bundle,
    is_active: data.is_active,
    franchise_id: data.franchise_id,
    franchise_name: franchiseName,
  };
}
