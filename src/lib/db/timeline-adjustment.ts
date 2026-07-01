import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProductTimeline,
  ProductTimelineInput,
  ProductTimelineItem,
  TimelineAnchor,
} from "@/types/database";

const TIMELINE_SELECT =
  "*, product_timeline_items(id, timeline_id, product_name, sku_id, sort_order, created_at)";

type TimelineRow = Record<string, unknown> & {
  product_timeline_items?: Record<string, unknown>[] | null;
};

function mapItem(row: Record<string, unknown>): ProductTimelineItem {
  return {
    id: row.id as string,
    timeline_id: row.timeline_id as string,
    product_name: row.product_name as string,
    sku_id: (row.sku_id as string | null) ?? null,
    sort_order: row.sort_order as number,
    created_at: row.created_at as string,
  };
}

function mapRow(row: TimelineRow): ProductTimeline {
  const items = (row.product_timeline_items ?? [])
    .map(mapItem)
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    id: row.id as string,
    products: items,
    anchor: row.anchor as TimelineAnchor,
    anchor_date: row.anchor_date as string,
    primary_packaging_days: row.primary_packaging_days as number,
    secondary_packaging_days: row.secondary_packaging_days as number,
    extract_days: row.extract_days as number,
    send_to_manufacturer_days: row.send_to_manufacturer_days as number,
    manufacturer_filling_days: row.manufacturer_filling_days as number,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

async function replaceTimelineItems(
  supabase: SupabaseClient,
  timelineId: string,
  products: ProductTimelineInput["products"],
): Promise<ProductTimelineItem[]> {
  const { error: deleteError } = await supabase
    .from("product_timeline_items")
    .delete()
    .eq("timeline_id", timelineId);
  if (deleteError) throw deleteError;

  if (products.length === 0) return [];

  const { data, error } = await supabase
    .from("product_timeline_items")
    .insert(
      products.map((product, index) => ({
        timeline_id: timelineId,
        product_name: product.product_name,
        sku_id: product.sku_id ?? null,
        sort_order: index,
      })),
    )
    .select("*");
  if (error) throw error;
  return (data ?? []).map(mapItem).sort((a, b) => a.sort_order - b.sort_order);
}

export async function listProductTimelines(
  supabase: SupabaseClient,
): Promise<ProductTimeline[]> {
  const { data, error } = await supabase
    .from("product_timelines")
    .select(TIMELINE_SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => mapRow(row as TimelineRow));
}

export async function getProductTimeline(
  supabase: SupabaseClient,
  id: string,
): Promise<ProductTimeline | null> {
  const { data, error } = await supabase
    .from("product_timelines")
    .select(TIMELINE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as TimelineRow) : null;
}

export async function createProductTimeline(
  supabase: SupabaseClient,
  input: ProductTimelineInput,
  createdBy: string | null,
): Promise<ProductTimeline> {
  const { data, error } = await supabase
    .from("product_timelines")
    .insert({
      anchor: input.anchor,
      anchor_date: input.anchor_date,
      primary_packaging_days: input.primary_packaging_days,
      secondary_packaging_days: input.secondary_packaging_days,
      extract_days: input.extract_days,
      send_to_manufacturer_days: input.send_to_manufacturer_days,
      manufacturer_filling_days: input.manufacturer_filling_days,
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;

  const products = await replaceTimelineItems(supabase, data.id as string, input.products);
  return mapRow({
    ...(data as TimelineRow),
    product_timeline_items: products as unknown as Record<string, unknown>[],
  });
}

export async function updateProductTimeline(
  supabase: SupabaseClient,
  id: string,
  input: ProductTimelineInput,
): Promise<ProductTimeline> {
  const { data, error } = await supabase
    .from("product_timelines")
    .update({
      anchor: input.anchor,
      anchor_date: input.anchor_date,
      primary_packaging_days: input.primary_packaging_days,
      secondary_packaging_days: input.secondary_packaging_days,
      extract_days: input.extract_days,
      send_to_manufacturer_days: input.send_to_manufacturer_days,
      manufacturer_filling_days: input.manufacturer_filling_days,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  const products = await replaceTimelineItems(supabase, id, input.products);
  return mapRow({
    ...(data as TimelineRow),
    product_timeline_items: products as unknown as Record<string, unknown>[],
  });
}

export async function deleteProductTimeline(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("product_timelines").delete().eq("id", id);
  if (error) throw error;
}
