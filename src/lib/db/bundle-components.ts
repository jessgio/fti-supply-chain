import type { SupabaseClient } from "@supabase/supabase-js";
import type { BundleBomLink, BundleSkuOption } from "@/types/database";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type LinkRow = {
  id: string;
  bundle_sku_id: string;
  component_sku_id: string;
  qty_per_bundle: number;
  bundle: { sku_code: string; name: string | null; is_bundle: boolean } | null;
  component: {
    sku_code: string;
    name: string | null;
    is_bundle: boolean;
  } | null;
};

function mapLinkRow(row: LinkRow): BundleBomLink {
  return {
    id: row.id,
    bundle_sku_id: row.bundle_sku_id,
    bundle_sku_code: row.bundle?.sku_code ?? "",
    bundle_name: row.bundle?.name ?? null,
    component_sku_id: row.component_sku_id,
    component_sku_code: row.component?.sku_code ?? "",
    component_name: row.component?.name ?? null,
    qty_per_bundle: Number(row.qty_per_bundle),
  };
}

const LINK_SELECT =
  "id, bundle_sku_id, component_sku_id, qty_per_bundle, " +
  "bundle:bundle_sku_id(sku_code, name, is_bundle), " +
  "component:component_sku_id(sku_code, name, is_bundle)";

export async function listBundleBomLinks(
  supabase: SupabaseClient,
  filters?: { bundleSkuId?: string },
): Promise<BundleBomLink[]> {
  let query = supabase.from("bundle_components").select(LINK_SELECT);
  if (filters?.bundleSkuId) {
    query = query.eq("bundle_sku_id", filters.bundleSkuId);
  }

  const { data, error } = await query.order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as LinkRow[]).map(mapLinkRow);
}

export interface NewBundleBomInput {
  bundle_sku_id: string;
  component_sku_id: string;
  qty_per_bundle: number;
}

export async function createBundleBomLink(
  supabase: SupabaseClient,
  input: NewBundleBomInput,
): Promise<BundleBomLink> {
  if (input.qty_per_bundle <= 0) {
    throw new Error("Quantity per bundle must be greater than zero.");
  }
  if (input.bundle_sku_id === input.component_sku_id) {
    throw new Error("A bundle cannot include itself as a component.");
  }

  const { data: skus, error: skuError } = await supabase
    .from("skus")
    .select("id, is_bundle")
    .in("id", [input.bundle_sku_id, input.component_sku_id]);
  if (skuError) throw skuError;

  const byId = new Map((skus ?? []).map((s) => [s.id, s]));
  const bundle = byId.get(input.bundle_sku_id);
  const component = byId.get(input.component_sku_id);
  if (!bundle || !component) {
    throw new Error("Bundle or component SKU not found.");
  }
  if (!bundle.is_bundle) {
    throw new Error("The parent SKU must be marked as a bundle.");
  }
  if (component.is_bundle) {
    throw new Error("Bundle components must be single (non-bundle) SKUs.");
  }

  const { data, error } = await supabase
    .from("bundle_components")
    .insert({
      bundle_sku_id: input.bundle_sku_id,
      component_sku_id: input.component_sku_id,
      qty_per_bundle: input.qty_per_bundle,
    })
    .select(LINK_SELECT)
    .single();
  if (error) throw error;
  return mapLinkRow(data as unknown as LinkRow);
}

export async function updateBundleBomLink(
  supabase: SupabaseClient,
  id: string,
  qty_per_bundle: number,
): Promise<BundleBomLink> {
  if (qty_per_bundle <= 0) {
    throw new Error("Quantity per bundle must be greater than zero.");
  }

  const { data, error } = await supabase
    .from("bundle_components")
    .update({ qty_per_bundle })
    .eq("id", id)
    .select(LINK_SELECT)
    .single();
  if (error) throw error;
  return mapLinkRow(data as unknown as LinkRow);
}

export async function deleteBundleBomLink(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("bundle_components")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

type BundleSkuRow = {
  id: string;
  sku_code: string;
  name: string | null;
  is_active: boolean;
};

export interface ComponentSkuOption {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_name: string | null;
  is_active: boolean;
}

type ComponentSkuRow = {
  id: string;
  sku_code: string;
  name: string | null;
  is_active: boolean;
  product_franchises: { name: string } | null;
};

export async function listBundleSkus(
  supabase: SupabaseClient,
): Promise<BundleSkuOption[]> {
  const bundles = await fetchAllRows<BundleSkuRow>(() =>
    supabase
      .from("skus")
      .select("id, sku_code, name, is_active")
      .eq("is_bundle", true)
      .order("sku_code") as unknown as Parameters<
      typeof fetchAllRows<BundleSkuRow>
    >[0] extends () => infer Q
      ? Q
      : never,
  );

  const componentRows = await fetchAllRows<{ bundle_sku_id: string }>(() =>
    supabase
      .from("bundle_components")
      .select("bundle_sku_id") as unknown as Parameters<
      typeof fetchAllRows<{ bundle_sku_id: string }>
    >[0] extends () => infer Q
      ? Q
      : never,
  );

  const counts = new Map<string, number>();
  for (const row of componentRows) {
    counts.set(row.bundle_sku_id, (counts.get(row.bundle_sku_id) ?? 0) + 1);
  }

  return bundles.map((row) => ({
    id: row.id,
    sku_code: row.sku_code,
    name: row.name,
    is_active: row.is_active,
    component_count: counts.get(row.id) ?? 0,
  }));
}

export async function listComponentSkuOptions(
  supabase: SupabaseClient,
): Promise<ComponentSkuOption[]> {
  const rows = await fetchAllRows<ComponentSkuRow>(() =>
    supabase
      .from("skus")
      .select("id, sku_code, name, is_active, product_franchises(name)")
      .eq("is_bundle", false)
      .order("sku_code") as unknown as Parameters<
      typeof fetchAllRows<ComponentSkuRow>
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
