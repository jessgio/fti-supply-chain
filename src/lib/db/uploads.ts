import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterSalesRowsForFullReprocess,
  filterSalesRowsForUpload,
  getSalesUploadCutoff,
  isSalesRowEligibleForImport,
  mergeRetailPrice,
  SALES_UPLOAD_MONTHS,
  type SalesImportMode,
} from "@/lib/sales/upload-window";
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

/** PostgREST puts `.in()` filters in the URL; ~16KB header limit with long SKU codes. */
const SKU_LOOKUP_CHUNK = 80;

/** Resolve many SKU codes with batched selects + upserts instead of per-row queries. */
async function ensureSkuIdsInCache(
  supabase: SupabaseClient,
  cache: Map<string, string>,
  skuCodes: string[],
): Promise<void> {
  const unique = [...new Set(skuCodes.filter(Boolean))];
  if (unique.length === 0) return;

  for (let i = 0; i < unique.length; i += SKU_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + SKU_LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from("skus")
      .select("id, sku_code")
      .in("sku_code", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      cache.set(row.sku_code, row.id);
    }
  }

  const missing = unique.filter((code) => !cache.has(code));
  for (let i = 0; i < missing.length; i += SKU_LOOKUP_CHUNK) {
    const chunk = missing.slice(i, i + SKU_LOOKUP_CHUNK);
    const { error: insertError } = await supabase.from("skus").upsert(
      chunk.map((sku_code) => ({
        sku_code,
        name: sku_code,
        is_bundle: false,
      })),
      { onConflict: "sku_code", ignoreDuplicates: true },
    );
    if (insertError) throw insertError;

    const { data, error } = await supabase
      .from("skus")
      .select("id, sku_code")
      .in("sku_code", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      cache.set(row.sku_code, row.id);
    }
  }
}

async function applyRetailPrices(
  supabase: SupabaseClient,
  retailBySku: Map<string, number>,
  skuCache: Map<string, string>,
): Promise<void> {
  const updates = [...retailBySku.entries()].flatMap(([skuCode, retailPrice]) => {
    const skuId = skuCache.get(skuCode);
    return skuId ? [{ skuId, retailPrice }] : [];
  });
  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    await Promise.all(
      updates.slice(i, i + batchSize).map(({ skuId, retailPrice }) =>
        supabase
          .from("skus")
          .update({ retail_price: retailPrice })
          .eq("id", skuId)
          .then(({ error }) => {
            if (error) throw error;
          }),
      ),
    );
  }
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

export async function beginSalesImport(
  supabase: SupabaseClient,
  params: {
    filename: string;
    rangeStart: string;
    rangeEnd: string;
    rowCount: number;
  },
): Promise<{ batchId: string; replacedCount: number }> {
  const { data: replacedCount, error: replaceError } = await supabase.rpc(
    "replace_sales_records_in_range",
    { from_date: params.rangeStart, to_date: params.rangeEnd },
  );
  if (replaceError) throw replaceError;

  const { data: batch, error: batchError } = await supabase
    .from("upload_batches")
    .insert({
      upload_type: "sales",
      filename: params.filename,
      row_count: params.rowCount,
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  return { batchId: batch.id, replacedCount: replacedCount ?? 0 };
}

export async function appendSalesImportRows(
  supabase: SupabaseClient,
  batchId: string,
  rows: SalesRow[],
  caches?: {
    channelCache?: Map<string, string>;
    skuCache?: Map<string, string>;
  },
): Promise<number> {
  if (rows.length === 0) return 0;

  const channelCache = caches?.channelCache ?? new Map<string, string>();
  const skuCache = caches?.skuCache ?? new Map<string, string>();

  await ensureSkuIdsInCache(
    supabase,
    skuCache,
    rows.map((row) => row.sku_code),
  );

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

  for (const row of rows) {
    let channelId = channelCache.get(row.channel);
    if (!channelId) {
      channelId = await upsertChannel(supabase, row.channel);
      channelCache.set(row.channel, channelId);
    }

    const skuId = skuCache.get(row.sku_code);
    if (!skuId) {
      throw new Error(`SKU not resolved: ${row.sku_code}`);
    }

    chunk.push({
      sale_date: row.sale_date,
      channel_id: channelId,
      sku_id: skuId,
      qty_sold: row.qty_sold,
      net_sales: row.net_sales,
      upload_batch_id: batchId,
    });

    if (chunk.length >= chunkSize) {
      await flushChunk();
    }
  }

  await flushChunk();
  return rows.length;
}

export async function finalizeSalesImport(
  supabase: SupabaseClient,
  retailBySku: Record<string, number> = {},
): Promise<void> {
  const skuCodes = Object.keys(retailBySku);
  for (let i = 0; i < skuCodes.length; i += SKU_LOOKUP_CHUNK) {
    const chunk = skuCodes.slice(i, i + SKU_LOOKUP_CHUNK);
    const { data: skus, error: skuError } = await supabase
      .from("skus")
      .select("id, sku_code, retail_price")
      .in("sku_code", chunk);
    if (skuError) throw skuError;

    for (const sku of skus ?? []) {
      const nextPrice = retailBySku[sku.sku_code];
      if (!nextPrice || nextPrice <= Number(sku.retail_price ?? 0)) continue;
      const { error } = await supabase
        .from("skus")
        .update({ retail_price: nextPrice })
        .eq("id", sku.id);
      if (error) throw error;
    }
  }

  const { error: refreshError } = await supabase.rpc(
    "refresh_franchise_sales_daily_agg",
  );
  if (refreshError) throw refreshError;
}

export type { SalesImportMode } from "@/lib/sales/upload-window";

const SALES_INSERT_BATCH = 2000;

export async function importSalesFromBufferStreaming(
  supabase: SupabaseClient,
  buffer: Buffer,
  filename: string,
  mode: SalesImportMode = "incremental",
) {
  const { iterateFtiSalesXlsx } = await import("@/lib/excel/wms-sales-stream");
  const cutoff = mode === "full" ? "" : getSalesUploadCutoff();
  const deleteFrom = mode === "full" ? "2020-01-01" : cutoff;
  const deleteTo = "2099-12-31";

  let batchId: string | undefined;
  let replacedCount = 0;
  let rowCount = 0;
  let skippedOlder = 0;
  let rangeStart = "";
  let rangeEnd = "";
  const retailBySku: Record<string, number> = {};
  const channelCache = new Map<string, string>();
  const skuCache = new Map<string, string>();
  const pending: SalesRow[] = [];
  let insertChain = Promise.resolve();

  async function ensureBatchStarted() {
    if (batchId) return;
    const started = await beginSalesImport(supabase, {
      filename,
      rangeStart: deleteFrom,
      rangeEnd: deleteTo,
      rowCount: 0,
    });
    batchId = started.batchId;
    replacedCount = started.replacedCount;
  }

  const queueInsert = (slice: SalesRow[]) => {
    insertChain = insertChain.then(async () => {
      await ensureBatchStarted();
      await appendSalesImportRows(supabase, batchId!, slice, {
        channelCache,
        skuCache,
      });
    });
  };

  await iterateFtiSalesXlsx(buffer, (row) => {
    if (!isSalesRowEligibleForImport(row, mode, cutoff)) {
      skippedOlder++;
      return;
    }
    rowCount++;
    if (!rangeStart || row.sale_date < rangeStart) rangeStart = row.sale_date;
    if (!rangeEnd || row.sale_date > rangeEnd) rangeEnd = row.sale_date;
    mergeRetailPrice(retailBySku, row);
    pending.push(row);
    if (pending.length >= SALES_INSERT_BATCH) {
      queueInsert(pending.splice(0, SALES_INSERT_BATCH));
    }
  });

  await insertChain;

  if (rowCount === 0) {
    throw new Error(
      mode === "full"
        ? "No sales rows found in file."
        : `No sales rows on or after ${cutoff}. Upload the last ${SALES_UPLOAD_MONTHS} months only; older data is kept automatically.`,
    );
  }

  if (pending.length > 0) {
    await ensureBatchStarted();
    await appendSalesImportRows(supabase, batchId!, pending, {
      channelCache,
      skuCache,
    });
  }

  await supabase
    .from("upload_batches")
    .update({ row_count: rowCount })
    .eq("id", batchId!);

  await finalizeSalesImport(supabase, retailBySku);

  return {
    batchId: batchId!,
    rowCount,
    replacedCount,
    skippedOlder,
    cutoff: mode === "full" ? rangeStart : cutoff,
    rangeStart,
    rangeEnd,
    mode,
  };
}

export async function importSales(
  supabase: SupabaseClient,
  rows: SalesRow[],
  filename: string,
  options: { mode?: SalesImportMode } = {},
) {
  const mode = options.mode ?? "incremental";
  const filtered =
    mode === "full"
      ? filterSalesRowsForFullReprocess(rows)
      : filterSalesRowsForUpload(rows);

  const { eligible, skippedOlder, cutoff, rangeStart, rangeEnd } = filtered;

  if (eligible.length === 0) {
    throw new Error(
      mode === "full"
        ? "No sales rows found in file."
        : `No sales rows on or after ${cutoff}. Upload the last ${SALES_UPLOAD_MONTHS} months only; older data is kept automatically.`,
    );
  }

  const retailBySku: Record<string, number> = {};
  for (const row of eligible) {
    if (row.retail_price && row.retail_price > 0) {
      retailBySku[row.sku_code] = Math.max(
        retailBySku[row.sku_code] ?? 0,
        row.retail_price,
      );
    }
  }

  const { batchId, replacedCount } = await beginSalesImport(supabase, {
    filename,
    rangeStart,
    rangeEnd,
    rowCount: eligible.length,
  });
  await appendSalesImportRows(supabase, batchId, eligible);
  await finalizeSalesImport(supabase, retailBySku);

  return {
    batchId,
    rowCount: eligible.length,
    replacedCount,
    skippedOlder,
    cutoff,
    rangeStart,
    rangeEnd,
    mode,
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
  await ensureSkuIdsInCache(
    supabase,
    skuCache,
    aggregated.map((row) => row.sku_code),
  );

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
    const skuId = skuCache.get(row.sku_code);
    if (!skuId) {
      throw new Error(`SKU not found after import: ${row.sku_code}`);
    }

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

  await applyRetailPrices(supabase, retailBySku, skuCache);

  return { batchId: batch.id, rowCount: aggregated.length };
}
