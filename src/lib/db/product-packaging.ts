import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductPackagingLink } from "@/types/database";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type LinkRow = {
  id: string;
  product_sku_id: string;
  packaging_sku_id: string;
  qty_per_unit: number;
  product: { sku_code: string; name: string | null; is_packaging: boolean } | null;
  packaging: { sku_code: string; name: string | null; is_packaging: boolean } | null;
};

function mapLinkRow(row: LinkRow): ProductPackagingLink {
  return {
    id: row.id,
    product_sku_id: row.product_sku_id,
    product_sku_code: row.product?.sku_code ?? "",
    product_name: row.product?.name ?? null,
    packaging_sku_id: row.packaging_sku_id,
    packaging_sku_code: row.packaging?.sku_code ?? "",
    packaging_name: row.packaging?.name ?? null,
    qty_per_unit: Number(row.qty_per_unit),
  };
}

const LINK_SELECT =
  "id, product_sku_id, packaging_sku_id, qty_per_unit, " +
  "product:product_sku_id(sku_code, name, is_packaging), " +
  "packaging:packaging_sku_id(sku_code, name, is_packaging)";

export async function listProductPackagingLinks(
  supabase: SupabaseClient,
  filters?: { packagingSkuId?: string; productSkuId?: string },
): Promise<ProductPackagingLink[]> {
  let query = supabase.from("product_packaging").select(LINK_SELECT);
  if (filters?.packagingSkuId) {
    query = query.eq("packaging_sku_id", filters.packagingSkuId);
  }
  if (filters?.productSkuId) {
    query = query.eq("product_sku_id", filters.productSkuId);
  }

  const { data, error } = await query.order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as LinkRow[]).map(mapLinkRow);
}

export interface NewProductPackagingInput {
  product_sku_id: string;
  packaging_sku_id: string;
  qty_per_unit: number;
}

export async function createProductPackagingLink(
  supabase: SupabaseClient,
  input: NewProductPackagingInput,
): Promise<ProductPackagingLink> {
  if (input.qty_per_unit <= 0) {
    throw new Error("Quantity per unit must be greater than zero.");
  }

  const { data: skus, error: skuError } = await supabase
    .from("skus")
    .select("id, is_packaging")
    .in("id", [input.product_sku_id, input.packaging_sku_id]);
  if (skuError) throw skuError;

  const byId = new Map((skus ?? []).map((s) => [s.id, s]));
  const product = byId.get(input.product_sku_id);
  const packaging = byId.get(input.packaging_sku_id);
  if (!product || !packaging) {
    throw new Error("Product or packaging SKU not found.");
  }
  if (product.is_packaging) {
    throw new Error("The finished-good SKU cannot be marked as packaging.");
  }
  if (!packaging.is_packaging) {
    throw new Error("The packaging SKU must be marked as packaging.");
  }

  const { data, error } = await supabase
    .from("product_packaging")
    .insert({
      product_sku_id: input.product_sku_id,
      packaging_sku_id: input.packaging_sku_id,
      qty_per_unit: input.qty_per_unit,
    })
    .select(LINK_SELECT)
    .single();
  if (error) throw error;
  return mapLinkRow(data as unknown as LinkRow);
}

export async function updateProductPackagingLink(
  supabase: SupabaseClient,
  id: string,
  qty_per_unit: number,
): Promise<ProductPackagingLink> {
  if (qty_per_unit <= 0) {
    throw new Error("Quantity per unit must be greater than zero.");
  }

  const { data, error } = await supabase
    .from("product_packaging")
    .update({ qty_per_unit })
    .eq("id", id)
    .select(LINK_SELECT)
    .single();
  if (error) throw error;
  return mapLinkRow(data as unknown as LinkRow);
}

export async function deleteProductPackagingLink(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("product_packaging").delete().eq("id", id);
  if (error) throw error;
}

export interface FinishedGoodSkuOption {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_name: string | null;
  is_active: boolean;
}

type FinishedGoodRow = {
  id: string;
  sku_code: string;
  name: string | null;
  is_active: boolean;
  product_franchises: { name: string } | null;
};

export async function listFinishedGoodSkus(
  supabase: SupabaseClient,
): Promise<FinishedGoodSkuOption[]> {
  const rows = await fetchAllRows<FinishedGoodRow>(() =>
    supabase
      .from("skus")
      .select("id, sku_code, name, is_active, product_franchises(name)")
      .eq("is_packaging", false)
      .order("sku_code") as unknown as Parameters<
      typeof fetchAllRows<FinishedGoodRow>
    >[0] extends () => infer Q
      ? Q
      : never,
  );

  return rows.map((row) => ({
    id: row.id,
    sku_code: row.sku_code,
    name: row.name,
    franchise_name: row.product_franchises?.name ?? null,
    is_active: row.is_active,
  }));
}
