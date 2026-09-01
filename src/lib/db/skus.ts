import type { SupabaseClient } from "@supabase/supabase-js";
import { setSkuRetailPrice } from "@/lib/db/sku-retail-prices";
import { slugify } from "@/lib/utils";

export interface CreateSkuInput {
  sku_code: string;
  name?: string | null;
  franchise_id?: string | null;
  franchise_name?: string | null;
  is_bundle?: boolean;
  is_packaging?: boolean;
  is_extract?: boolean;
  retail_price?: number | null;
}

export interface CreatedSkuRow {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_extract: boolean;
  is_clearance: boolean;
  is_active: boolean;
  franchise_id: string | null;
  franchise_name: string | null;
  retail_price: number | null;
}

export interface ExistingSkuConflict {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_extract: boolean;
  is_clearance: boolean;
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
  is_extract?: boolean;
  is_clearance?: boolean;
  franchise_id?: string | null;
  franchise_name?: string | null;
  unit_cogs?: number | null;
  retail_price?: number | null;
  /** YYYY-MM or YYYY-MM-DD; ignored for first-time RSP (uses base date). */
  effective_from?: string | null;
}

const SKU_SELECT =
  "id, sku_code, name, is_bundle, is_packaging, is_extract, is_clearance, is_active, franchise_id, retail_price, product_franchises(name)";

function mapSkuRow(data: {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_extract: boolean;
  is_clearance: boolean;
  is_active: boolean;
  franchise_id: string | null;
  retail_price?: number | null;
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
    is_extract: Boolean(data.is_extract),
    is_clearance: Boolean(data.is_clearance),
    is_active: data.is_active,
    franchise_id: data.franchise_id,
    franchise_name: franchiseName,
    retail_price:
      data.retail_price == null ? null : Number(data.retail_price),
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
  const isExtract = Boolean(input.is_extract);
  const kindCount = [isBundle, isPackaging, isExtract].filter(Boolean).length;
  if (kindCount > 1) {
    throw new Error(
      "A SKU cannot be more than one of bundle, packaging, or extract.",
    );
  }
  if (
    (isBundle || isPackaging || isExtract) &&
    (input.franchise_id || input.franchise_name?.trim())
  ) {
    throw new Error(
      isBundle
        ? "Bundle SKUs cannot be assigned to a franchise."
        : isPackaging
          ? "Packaging SKUs cannot be assigned to a franchise."
          : "Extract SKUs cannot be assigned to a franchise.",
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("skus")
    .select(
      "id, sku_code, name, is_bundle, is_packaging, is_extract, is_clearance, is_active, franchise_id",
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
      is_extract: Boolean(existing.is_extract),
      is_clearance: Boolean(existing.is_clearance),
      is_active: existing.is_active,
      franchise_id: existing.franchise_id,
    });
  }

  const franchiseId =
    isBundle || isPackaging || isExtract
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
      is_extract: isExtract,
      is_active: true,
      retail_price: retailPrice,
    })
    .select(SKU_SELECT)
    .single();

  if (error) throw error;

  if (retailPrice) {
    await setSkuRetailPrice(supabase, data.id, retailPrice);
  }

  return mapSkuRow(data);
}

export async function updateSku(
  supabase: SupabaseClient,
  id: string,
  input: UpdateSkuInput,
): Promise<CreatedSkuRow> {
  const { data: existing, error: fetchError } = await supabase
    .from("skus")
    .select("id, sku_code, is_bundle, is_packaging, is_extract, franchise_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) {
    throw new Error("SKU not found.");
  }

  const kindChanging =
    typeof input.is_bundle === "boolean" ||
    typeof input.is_packaging === "boolean" ||
    typeof input.is_extract === "boolean";

  const nextIsBundle =
    typeof input.is_bundle === "boolean" ? input.is_bundle : existing.is_bundle;
  const nextIsPackaging =
    typeof input.is_packaging === "boolean"
      ? input.is_packaging
      : existing.is_packaging;
  const nextIsExtract =
    typeof input.is_extract === "boolean"
      ? input.is_extract
      : Boolean(existing.is_extract);

  const kindCount = [nextIsBundle, nextIsPackaging, nextIsExtract].filter(
    Boolean,
  ).length;
  if (kindCount > 1) {
    throw new Error(
      "A SKU cannot be more than one of bundle, packaging, or extract.",
    );
  }

  const updates: {
    name?: string;
    is_active?: boolean;
    is_bundle?: boolean;
    is_packaging?: boolean;
    is_extract?: boolean;
    is_clearance?: boolean;
    franchise_id?: string | null;
    unit_cogs?: number | null;
  } = {};

  if (input.name !== undefined) {
    updates.name = input.name?.trim() || existing.sku_code;
  }

  if (typeof input.is_active === "boolean") {
    updates.is_active = input.is_active;
  }
  if (typeof input.is_clearance === "boolean") {
    updates.is_clearance = input.is_clearance;
  }

  // Kind transitions: bundle/packaging/extract clear franchise and other kinds.
  if (kindChanging) {
    if (nextIsBundle) {
      updates.is_bundle = true;
      updates.is_packaging = false;
      updates.is_extract = false;
      updates.franchise_id = null;
    } else if (nextIsPackaging) {
      updates.is_packaging = true;
      updates.is_bundle = false;
      updates.is_extract = false;
      updates.franchise_id = null;
    } else if (nextIsExtract) {
      updates.is_extract = true;
      updates.is_bundle = false;
      updates.is_packaging = false;
      updates.franchise_id = null;
    } else {
      updates.is_bundle = false;
      updates.is_packaging = false;
      updates.is_extract = false;
    }
  }

  if (input.franchise_id !== undefined || input.franchise_name !== undefined) {
    if (nextIsBundle) {
      throw new Error("Bundle SKUs cannot be assigned to a franchise.");
    }
    if (nextIsPackaging) {
      throw new Error("Packaging SKUs cannot be assigned to a franchise.");
    }
    if (nextIsExtract) {
      throw new Error("Extract SKUs cannot be assigned to a franchise.");
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
    updates.is_extract = false;
  }

  if (input.unit_cogs !== undefined) {
    if (input.unit_cogs != null && input.unit_cogs < 0) {
      throw new Error("Unit COGS cannot be negative.");
    }
    updates.unit_cogs = input.unit_cogs;
  }

  if (Object.keys(updates).length === 0 && input.retail_price === undefined) {
    throw new Error("No valid fields to update.");
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("skus").update(updates).eq("id", id);
    if (error) throw error;
  }

  if (input.retail_price !== undefined) {
    await setSkuRetailPrice(
      supabase,
      id,
      input.retail_price,
      input.effective_from,
    );
  }

  const { data, error } = await supabase
    .from("skus")
    .select(SKU_SELECT)
    .eq("id", id)
    .single();

  if (error) throw error;

  return mapSkuRow(data);
}

/**
 * Ensure a SKU exists for an extract ledger item so it can be used on POs.
 * Creates or upgrades the row to is_extract; refuses packaging/bundle conflicts.
 */
export async function ensureExtractSku(
  supabase: SupabaseClient,
  itemNo: string,
  description?: string | null,
): Promise<string> {
  const skuCode = itemNo.trim();
  if (!skuCode) throw new Error("Extract item number is required.");
  const name = description?.trim() || skuCode;

  const { data: existing, error: existingError } = await supabase
    .from("skus")
    .select("id, sku_code, name, is_bundle, is_packaging, is_extract")
    .eq("sku_code", skuCode)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (existing.is_bundle || existing.is_packaging) {
      throw new Error(
        `SKU "${skuCode}" is already ${existing.is_bundle ? "a bundle" : "packaging"} and cannot be marked as extract.`,
      );
    }
    const updates: {
      is_extract?: boolean;
      franchise_id?: null;
      name?: string;
    } = {};
    if (!existing.is_extract) {
      updates.is_extract = true;
      updates.franchise_id = null;
    }
    if (
      name &&
      name !== skuCode &&
      (!existing.name || existing.name === existing.sku_code)
    ) {
      updates.name = name;
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("skus")
        .update(updates)
        .eq("id", existing.id);
      if (error) throw error;
    }
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("skus")
    .insert({
      sku_code: skuCode,
      name,
      franchise_id: null,
      is_bundle: false,
      is_packaging: false,
      is_extract: true,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
