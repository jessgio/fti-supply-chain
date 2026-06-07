import type { SupabaseClient } from "@supabase/supabase-js";
import { filterSalesRowsForUpload, SALES_UPLOAD_MONTHS } from "@/lib/sales/upload-window";
import { slugify } from "@/lib/utils";
import type { BundleComponent, MappingRow, SalesRow, StockRow } from "@/types/database";

async function upsertChannel(
  supabase: SupabaseClient,
  name: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("sales_channels")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("sales_channels")
    .insert({ name })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertFranchise(
  supabase: SupabaseClient,
  name: string,
): Promise<string> {
  const slug = slugify(name);
  const { data: existing } = await supabase
    .from("product_franchises")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("product_franchises")
    .insert({ name, slug })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function resolveSkuId(
  supabase: SupabaseClient,
  cache: Map<string, string>,
  skuCode: string,
): Promise<string> {
  const cached = cache.get(skuCode);
  if (cached) return cached;

  const { data: sku } = await supabase
    .from("skus")
    .select("id")
    .eq("sku_code", skuCode)
    .maybeSingle();

  const skuId = sku?.id ?? (await upsertSku(supabase, skuCode, null, false));
  cache.set(skuCode, skuId);
  return skuId;
}

async function upsertSku(
  supabase: SupabaseClient,
  skuCode: string,
  franchiseId: string | null,
  isBundle: boolean,
  name?: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("skus")
    .select("id")
    .eq("sku_code", skuCode)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("skus")
      .update({ franchise_id: franchiseId, is_bundle: isBundle, name })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("skus")
    .insert({
      sku_code: skuCode,
      franchise_id: franchiseId,
      is_bundle: isBundle,
      name: name ?? skuCode,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function importMappings(
  supabase: SupabaseClient,
  mappings: MappingRow[],
  bundles: BundleComponent[],
  filename: string,
) {
  const { data: batch, error: batchError } = await supabase
    .from("upload_batches")
    .insert({
      upload_type: "mappings",
      filename,
      row_count: mappings.length + bundles.length,
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  const skuIdByCode = new Map<string, string>();
  const mappedSkuCodes = new Set(mappings.map((row) => row.sku_code));

  // Franchise sheet: single SKUs only — franchises roll up aggregated unit sales
  for (const row of mappings) {
    const franchiseId = await upsertFranchise(supabase, row.franchise_name);
    const skuId = await upsertSku(
      supabase,
      row.sku_code,
      franchiseId,
      false,
      row.sku_name,
    );
    skuIdByCode.set(row.sku_code, skuId);
  }

  // Bundle sheet: parent bundle SKUs (no franchise); components must be single SKUs
  const bundleSkuCodes = new Set(bundles.map((b) => b.bundle_sku_code));
  for (const bundleSkuCode of bundleSkuCodes) {
    const skuId = await upsertSku(supabase, bundleSkuCode, null, true);
    skuIdByCode.set(bundleSkuCode, skuId);
  }

  const bundleInsertByPair = new Map<
    string,
    {
      bundle_sku_id: string;
      component_sku_id: string;
      qty_per_bundle: number;
    }
  >();

  for (const bundle of bundles) {
    if (!skuIdByCode.has(bundle.component_sku_code)) {
      const skuId = await upsertSku(
        supabase,
        bundle.component_sku_code,
        null,
        false,
      );
      skuIdByCode.set(bundle.component_sku_code, skuId);
    }

    const bundleId = skuIdByCode.get(bundle.bundle_sku_code);
    const componentId = skuIdByCode.get(bundle.component_sku_code);
    if (!bundleId || !componentId) continue;

    // Last row wins when the bundle sheet repeats the same parent + component pair.
    bundleInsertByPair.set(`${bundleId}|${componentId}`, {
      bundle_sku_id: bundleId,
      component_sku_id: componentId,
      qty_per_bundle: bundle.qty_per_bundle,
    });
  }

  const bundleInserts = [...bundleInsertByPair.values()];

  const bundleChunkSize = 500;
  for (let i = 0; i < bundleInserts.length; i += bundleChunkSize) {
    const chunk = bundleInserts.slice(i, i + bundleChunkSize);
    const { error } = await supabase.from("bundle_components").upsert(chunk, {
      onConflict: "bundle_sku_id,component_sku_id",
    });
    if (error) throw error;
  }

  // Drop franchise assignment from single SKUs no longer in the franchise sheet.
  const { data: previouslyMapped, error: mappedQueryError } = await supabase
    .from("skus")
    .select("id, sku_code")
    .not("franchise_id", "is", null)
    .eq("is_bundle", false);
  if (mappedQueryError) throw mappedQueryError;

  const staleIds = (previouslyMapped ?? [])
    .filter((sku) => !mappedSkuCodes.has(sku.sku_code))
    .map((sku) => sku.id);
  if (staleIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < staleIds.length; i += chunkSize) {
      const chunk = staleIds.slice(i, i + chunkSize);
      const { error: clearError } = await supabase
        .from("skus")
        .update({ franchise_id: null })
        .in("id", chunk);
      if (clearError) throw clearError;
    }
  }

  const { error: refreshError } = await supabase.rpc(
    "refresh_franchise_sales_daily_agg",
  );
  if (refreshError) throw refreshError;

  return {
    batchId: batch.id,
    mappingCount: mappings.length,
    bundleCount: bundleInserts.length,
  };
}

export async function importSales(
  supabase: SupabaseClient,
  rows: SalesRow[],
  filename: string,
) {
  const {
    eligible,
    skippedOlder,
    cutoff,
    rangeStart,
    rangeEnd,
  } = filterSalesRowsForUpload(rows);

  if (eligible.length === 0) {
    throw new Error(
      `No sales rows on or after ${cutoff}. Upload the last ${SALES_UPLOAD_MONTHS} months only; older data is kept automatically.`,
    );
  }

  const { data: replacedCount, error: replaceError } = await supabase.rpc(
    "replace_sales_records_in_range",
    { from_date: rangeStart, to_date: rangeEnd },
  );
  if (replaceError) throw replaceError;

  const { data: batch, error: batchError } = await supabase
    .from("upload_batches")
    .insert({
      upload_type: "sales",
      filename,
      row_count: eligible.length,
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  const channelCache = new Map<string, string>();
  const skuCache = new Map<string, string>();
  const retailBySku = new Map<string, number>();
  const chunkSize = 2000;
  let chunk: {
    sale_date: string;
    channel_id: string;
    sku_id: string;
    qty_sold: number;
    net_sales: number;
    upload_batch_id: string;
  }[] = [];

  async function flushChunk() {
    if (chunk.length === 0) return;
    const { error } = await supabase.from("sales_records").insert(chunk);
    if (error) throw error;
    chunk = [];
  }

  for (const row of eligible) {
    let channelId = channelCache.get(row.channel);
    if (!channelId) {
      channelId = await upsertChannel(supabase, row.channel);
      channelCache.set(row.channel, channelId);
    }

    const skuId = await resolveSkuId(supabase, skuCache, row.sku_code);

    if (row.retail_price && row.retail_price > 0) {
      const current = retailBySku.get(row.sku_code) ?? 0;
      if (row.retail_price > current) {
        retailBySku.set(row.sku_code, row.retail_price);
      }
    }

    chunk.push({
      sale_date: row.sale_date,
      channel_id: channelId,
      sku_id: skuId,
      qty_sold: row.qty_sold,
      net_sales: row.net_sales,
      upload_batch_id: batch.id,
    });

    if (chunk.length >= chunkSize) {
      await flushChunk();
    }
  }

  await flushChunk();

  for (const [skuCode, retailPrice] of retailBySku) {
    const skuId = skuCache.get(skuCode);
    if (!skuId) continue;
    await supabase
      .from("skus")
      .update({ retail_price: retailPrice })
      .eq("id", skuId);
  }

  const { error: refreshError } = await supabase.rpc(
    "refresh_franchise_sales_daily_agg",
  );
  if (refreshError) throw refreshError;

  return {
    batchId: batch.id,
    rowCount: eligible.length,
    replacedCount: replacedCount ?? 0,
    skippedOlder,
    cutoff,
    rangeStart,
    rangeEnd,
  };
}

function aggregateStockRows(rows: StockRow[]): StockRow[] {
  const map = new Map<string, StockRow>();
  for (const row of rows) {
    const key = `${row.sku_code}|${row.location}|${row.as_of_date}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty_on_hand += row.qty_on_hand;
      if (
        row.retail_price &&
        (!existing.retail_price || row.retail_price > existing.retail_price)
      ) {
        existing.retail_price = row.retail_price;
      }
    } else {
      map.set(key, { ...row });
    }
  }
  return [...map.values()];
}

export async function importStock(
  supabase: SupabaseClient,
  rows: StockRow[],
  filename: string,
) {
  const aggregated = aggregateStockRows(rows);

  const { data: batch, error: batchError } = await supabase
    .from("upload_batches")
    .insert({
      upload_type: "stock",
      filename,
      row_count: aggregated.length,
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  const skuCache = new Map<string, string>();
  const retailBySku = new Map<string, number>();
  const chunkSize = 2000;
  let chunk: {
    sku_id: string;
    location: string;
    qty_on_hand: number;
    as_of_date: string;
    upload_batch_id: string;
  }[] = [];

  async function flushChunk() {
    if (chunk.length === 0) return;
    const { error } = await supabase.from("stock_levels").upsert(chunk, {
      onConflict: "sku_id,location,as_of_date",
    });
    if (error) throw error;
    chunk = [];
  }

  for (const row of aggregated) {
    const skuId = await resolveSkuId(supabase, skuCache, row.sku_code);

    if (row.retail_price && row.retail_price > 0) {
      const current = retailBySku.get(row.sku_code) ?? 0;
      if (row.retail_price > current) {
        retailBySku.set(row.sku_code, row.retail_price);
      }
    }

    chunk.push({
      sku_id: skuId,
      location: row.location,
      qty_on_hand: row.qty_on_hand,
      as_of_date: row.as_of_date,
      upload_batch_id: batch.id,
    });

    if (chunk.length >= chunkSize) {
      await flushChunk();
    }
  }

  await flushChunk();

  for (const [skuCode, retailPrice] of retailBySku) {
    const skuId = skuCache.get(skuCode);
    if (!skuId) continue;
    await supabase
      .from("skus")
      .update({ retail_price: retailPrice })
      .eq("id", skuId);
  }

  return { batchId: batch.id, rowCount: aggregated.length };
}
