import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";

export interface CreateSkuInput {
  sku_code: string;
  name?: string | null;
  franchise_id?: string | null;
  franchise_name?: string | null;
  is_bundle?: boolean;
  is_packaging?: boolean;
  retail_price?: number | null;
}

export interface CreatedSkuRow {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_active: boolean;
  franchise_id: string | null;
  franchise_name: string | null;
}

export interface ExistingSkuConflict {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_active: boolean;
  franchise_id: string | null;
}

export class SkuAlreadyExistsError extends Error {
  readonly existing: ExistingSkuConflict;

  constructor(existing: ExistingSkuConflict) {
    super(`SKU already exists: ${existing.sku_code}`);
    this.name = "SkuAlreadyExistsError";
    this.existing = existing;
  }
}

export interface UpdateSkuInput {
  name?: string | null;
  is_active?: boolean;
  is_bundle?: boolean;
  is_packaging?: boolean;
  franchise_id?: string | null;
  franchise_name?: string | null;
  unit_cogs?: number | null;
}

const SKU_SELECT =
  "id, sku_code, name, is_bundle, is_packaging, is_active, franchise_id, product_franchises(name)";

function mapSkuRow(data: {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_active: boolean;
  franchise_id: string | null;
  product_franchises: unknown;
}): CreatedSkuRow {
  const franchise = data.product_franchises as
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
    is_packaging: data.is_packaging,
    is_active: data.is_active,
    franchise_id: data.franchise_id,
    franchise_name: franchiseName,
  };
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
  const isPackaging = Boolean(input.is_packaging);
  if (isBundle && isPackaging) {
    throw new Error("A SKU cannot be both a bundle and packaging.");
  }
  if (
    (isBundle || isPackaging) &&
    (input.franchise_id || input.franchise_name?.trim())
  ) {
    throw new Error(
      isBundle
        ? "Bundle SKUs cannot be assigned to a franchise."
        : "Packaging SKUs cannot be assigned to a franchise.",
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("skus")
    .select(
      "id, sku_code, name, is_bundle, is_packaging, is_active, franchise_id",
    )
    .eq("sku_code", skuCode)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new SkuAlreadyExistsError({
      id: existing.id,
      sku_code: existing.sku_code,
      name: existing.name,
      is_bundle: existing.is_bundle,
      is_packaging: existing.is_packaging,
      is_active: existing.is_active,
      franchise_id: existing.franchise_id,
    });
  }

  const franchiseId =
    isBundle || isPackaging
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
      is_packaging: isPackaging,
      is_active: true,
      retail_price: retailPrice,
    })
    .select(SKU_SELECT)
    .single();

  if (error) throw error;

  return mapSkuRow(data);
}

export async function updateSku(
  supabase: SupabaseClient,
  id: string,
  input: UpdateSkuInput,
): Promise<CreatedSkuRow> {
  const { data: existing, error: fetchError } = await supabase
    .from("skus")
    .select("id, sku_code, is_bundle, is_packaging, franchise_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) {
    throw new Error("SKU not found.");
  }

  const kindChanging =
    typeof input.is_bundle === "boolean" ||
    typeof input.is_packaging === "boolean";

  const nextIsBundle =
    typeof input.is_bundle === "boolean" ? input.is_bundle : existing.is_bundle;
  const nextIsPackaging =
    typeof input.is_packaging === "boolean"
      ? input.is_packaging
      : existing.is_packaging;

  if (nextIsBundle && nextIsPackaging) {
    throw new Error("A SKU cannot be both a bundle and packaging.");
  }

  const updates: {
    name?: string;
    is_active?: boolean;
    is_bundle?: boolean;
    is_packaging?: boolean;
    franchise_id?: string | null;
    unit_cogs?: number | null;
  } = {};

  if (input.name !== undefined) {
    updates.name = input.name?.trim() || existing.sku_code;
  }

  if (typeof input.is_active === "boolean") {
    updates.is_active = input.is_active;
  }

  // Kind transitions: bundle/packaging clear franchise; packaging clears bundle and vice versa.
  if (kindChanging) {
    if (nextIsBundle) {
      updates.is_bundle = true;
      updates.is_packaging = false;
      updates.franchise_id = null;
    } else if (nextIsPackaging) {
      updates.is_packaging = true;
      updates.is_bundle = false;
      updates.franchise_id = null;
    } else {
      updates.is_bundle = false;
      updates.is_packaging = false;
    }
  }

  if (input.franchise_id !== undefined || input.franchise_name !== undefined) {
    if (nextIsBundle) {
      throw new Error("Bundle SKUs cannot be assigned to a franchise.");
    }
    if (nextIsPackaging) {
      throw new Error("Packaging SKUs cannot be assigned to a franchise.");
    }
    const franchiseId = await resolveFranchiseId(
      supabase,
      typeof input.franchise_id === "string" ? input.franchise_id : null,
      typeof input.franchise_name === "string" ? input.franchise_name : null,
    );
    if (!franchiseId) {
      throw new Error("Franchise is required.");
    }
    updates.franchise_id = franchiseId;
    updates.is_bundle = false;
    updates.is_packaging = false;
  }

  if (input.unit_cogs !== undefined) {
    if (input.unit_cogs != null && input.unit_cogs < 0) {
      throw new Error("Unit COGS cannot be negative.");
    }
    updates.unit_cogs = input.unit_cogs;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No valid fields to update.");
  }

  const { data, error } = await supabase
    .from("skus")
    .update(updates)
    .eq("id", id)
    .select(SKU_SELECT)
    .single();

  if (error) throw error;

  return mapSkuRow(data);
}
