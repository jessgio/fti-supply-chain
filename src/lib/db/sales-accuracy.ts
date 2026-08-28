import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import {
  completedMonthsInYear,
  summarizeAccuracy,
  type AccuracyPoint,
} from "@/lib/sales-forecast/accuracy";
import {
  SOP_GROUPS,
  type SopChannelGroup,
} from "@/lib/sales-forecast/constants";
import {
  postTaxFromWmsNet,
  postTaxNet,
  vatInclusiveNet,
} from "@/lib/sales-forecast/math";
import { listEligibleSkus, listSalesChannels } from "@/lib/db/sales-forecast";
import { fetchAllRpc, fetchAllRows } from "@/lib/supabase/fetch-all";
import type {
  SalesAccuracyGroupSummary,
  SalesAccuracyMetrics,
  SalesAccuracyMonthSlice,
  SalesAccuracyPayload,
  SalesAccuracySkuRow,
  SalesAccuracyYtdRunningSlice,
} from "@/types/database";

type SkuMeta = {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  retail_price: number | null;
  franchise_name: string | null;
};

type SkuAccum = {
  meta: SkuMeta;
  qtyPoints: AccuracyPoint[];
  netPoints: AccuracyPoint[];
  plan_qty: number;
  actual_qty: number;
  plan_post_tax: number;
  actual_post_tax: number;
};

type MonthBucket = {
  qtyPoints: AccuracyPoint[];
  netPoints: AccuracyPoint[];
  bySku: Map<string, SkuAccum>;
};

function emptyMetrics(): SalesAccuracyMetrics {
  return {
    plan_qty: 0,
    actual_qty: 0,
    plan_post_tax: 0,
    actual_post_tax: 0,
    wmape_qty: null,
    bias_qty: null,
    wmape_post_tax: null,
    bias_post_tax: null,
    sku_count: 0,
    sku_month_count: 0,
  };
}

function emptyGroup(
  group: SopChannelGroup | "combined",
): SalesAccuracyGroupSummary {
  return {
    group,
    ...emptyMetrics(),
    skus: [],
    months: [],
    ytd_running: [],
  };
}

function metricsFromPoints(
  qtyPoints: AccuracyPoint[],
  netPoints: AccuracyPoint[],
  skuCount: number,
): SalesAccuracyMetrics {
  const qtySummary = summarizeAccuracy(qtyPoints);
  const netSummary = summarizeAccuracy(netPoints);
  return {
    plan_qty: qtySummary.plan_total,
    actual_qty: qtySummary.actual_total,
    plan_post_tax: netSummary.plan_total,
    actual_post_tax: netSummary.actual_total,
    wmape_qty: qtySummary.wmape,
    bias_qty: qtySummary.bias,
    wmape_post_tax: netSummary.wmape,
    bias_post_tax: netSummary.bias,
    sku_count: skuCount,
    sku_month_count: qtySummary.point_count,
  };
}

function skusFromAccum(bySku: Map<string, SkuAccum>): SalesAccuracySkuRow[] {
  return [...bySku.values()]
    .map((row) => {
      const qty = summarizeAccuracy(row.qtyPoints);
      const net = summarizeAccuracy(row.netPoints);
      return {
        sku_id: row.meta.id,
        sku_code: row.meta.sku_code,
        name: row.meta.name,
        is_bundle: row.meta.is_bundle,
        franchise_name: row.meta.franchise_name,
        plan_qty: row.plan_qty,
        actual_qty: row.actual_qty,
        plan_post_tax: row.plan_post_tax,
        actual_post_tax: row.actual_post_tax,
        wmape_qty: qty.wmape,
        bias_qty: qty.bias,
        wmape_post_tax: net.wmape,
        bias_post_tax: net.bias,
        sku_month_count: row.qtyPoints.length,
      };
    })
    .sort((a, b) => a.sku_code.localeCompare(b.sku_code));
}

function pushPointToSku(
  bySku: Map<string, SkuAccum>,
  meta: SkuMeta,
  qtyPoint: AccuracyPoint,
  netPoint: AccuracyPoint,
) {
  let skuRow = bySku.get(meta.id);
  if (!skuRow) {
    skuRow = {
      meta,
      qtyPoints: [],
      netPoints: [],
      plan_qty: 0,
      actual_qty: 0,
      plan_post_tax: 0,
      actual_post_tax: 0,
    };
    bySku.set(meta.id, skuRow);
  }
  skuRow.qtyPoints.push(qtyPoint);
  skuRow.netPoints.push(netPoint);
  skuRow.plan_qty += qtyPoint.plan;
  skuRow.actual_qty += qtyPoint.actual;
  skuRow.plan_post_tax += netPoint.plan;
  skuRow.actual_post_tax += netPoint.actual;
}

function emptyMonthBucket(): MonthBucket {
  return { qtyPoints: [], netPoints: [], bySku: new Map() };
}

function buildGroupFromBuckets(
  group: SopChannelGroup | "combined",
  completedMonths: number[],
  monthBuckets: Map<number, MonthBucket>,
): SalesAccuracyGroupSummary {
  const ytdQty: AccuracyPoint[] = [];
  const ytdNet: AccuracyPoint[] = [];
  const ytdBySku = new Map<string, SkuAccum>();
  const months: SalesAccuracyMonthSlice[] = [];
  const ytd_running: SalesAccuracyYtdRunningSlice[] = [];

  for (const month of completedMonths) {
    const bucket = monthBuckets.get(month) ?? emptyMonthBucket();
    const skus = skusFromAccum(bucket.bySku);
    months.push({
      month,
      ...metricsFromPoints(bucket.qtyPoints, bucket.netPoints, skus.length),
      skus,
    });

    for (const p of bucket.qtyPoints) ytdQty.push(p);
    for (const p of bucket.netPoints) ytdNet.push(p);
    for (const accum of bucket.bySku.values()) {
      for (let i = 0; i < accum.qtyPoints.length; i += 1) {
        pushPointToSku(
          ytdBySku,
          accum.meta,
          accum.qtyPoints[i]!,
          accum.netPoints[i]!,
        );
      }
    }

    ytd_running.push({
      through_month: month,
      ...metricsFromPoints(ytdQty, ytdNet, ytdBySku.size),
    });
  }

  const ytdSkus = skusFromAccum(ytdBySku);
  return {
    group,
    ...metricsFromPoints(ytdQty, ytdNet, ytdSkus.length),
    skus: ytdSkus,
    months,
    ytd_running,
  };
}

async function loadSkuMetaByIds(
  supabase: SupabaseClient,
  ids: string[],
  known: Map<string, SkuMeta>,
): Promise<Map<string, SkuMeta>> {
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length === 0) return known;

  const rows = await fetchAllRows<{
    id: string;
    sku_code: string;
    name: string | null;
    is_bundle: boolean;
    retail_price: number | null;
    product_franchises: { name: string } | { name: string }[] | null;
  }>(() =>
    supabase
      .from("skus")
      .select(
        "id, sku_code, name, is_bundle, retail_price, product_franchises(name)",
      )
      .in("id", missing),
  );

  for (const row of rows) {
    const franchise = row.product_franchises;
    const franchiseName = Array.isArray(franchise)
      ? (franchise[0]?.name ?? null)
      : (franchise?.name ?? null);
    known.set(row.id, {
      id: row.id,
      sku_code: row.sku_code,
      name: row.name,
      is_bundle: row.is_bundle,
      retail_price: row.retail_price == null ? null : Number(row.retail_price),
      franchise_name: row.is_bundle ? null : franchiseName,
    });
  }
  return known;
}

/**
 * Latest SKU plan inputs vs sales actuals for completed months in `year`.
 * Online / Offline scored independently; combined merges both teams' points.
 * Includes monthly slices and running YTD (cumulative) team metrics.
 */
export async function loadSalesAccuracy(
  supabase: SupabaseClient,
  year: number,
): Promise<SalesAccuracyPayload> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const completed_months = completedMonthsInYear(year, now);
  const current_month =
    year > now.getFullYear()
      ? 1
      : year === now.getFullYear()
        ? currentMonth
        : 13;

  if (completed_months.length === 0) {
    return {
      year,
      current_month,
      completed_months,
      groups: {
        online: emptyGroup("online"),
        offline: emptyGroup("offline"),
      },
      combined: emptyGroup("combined"),
    };
  }

  const channels = await listSalesChannels(supabase);
  const channelGroup = new Map(
    channels.map((c) => [c.id, c.sop_group] as const),
  );
  const mappedChannelIds = new Set(
    channels.filter((c) => c.sop_group).map((c) => c.id),
  );

  const yearStart = `${year}-01-01`;
  const lastCompleted = completed_months[completed_months.length - 1]!;
  const yearEnd = format(new Date(year, lastCompleted, 0), "yyyy-MM-dd");

  const [eligible, plansRes, monthlyActuals] = await Promise.all([
    listEligibleSkus(supabase),
    supabase
      .from("sop_sku_month_plans")
      .select(
        "sku_id, month, projected_qty, avg_discount_pct, sop_group",
      )
      .eq("year", year)
      .in("month", completed_months),
    mappedChannelIds.size > 0
      ? fetchAllRpc<{
          sku_id: string;
          channel_id: string;
          sale_year: number;
          sale_month: number;
          qty: number;
          net_sales: number;
        }>(supabase, "get_sop_monthly_actuals", {
          p_start: yearStart,
          p_end: yearEnd,
        })
      : Promise.resolve([]),
  ]);

  if (plansRes.error) throw plansRes.error;

  const skuMeta = new Map<string, SkuMeta>(
    eligible.map((s) => [
      s.id,
      {
        id: s.id,
        sku_code: s.sku_code,
        name: s.name,
        is_bundle: s.is_bundle,
        retail_price: s.retail_price,
        franchise_name: s.franchise_name,
      },
    ]),
  );

  const actualByGroup = {
    online: new Map<string, { qty: number; post_tax: number }>(),
    offline: new Map<string, { qty: number; post_tax: number }>(),
  };
  const completedSet = new Set(completed_months);

  for (const row of monthlyActuals) {
    if (row.sale_year !== year) continue;
    if (!completedSet.has(row.sale_month)) continue;
    if (!mappedChannelIds.has(row.channel_id)) continue;
    const group = channelGroup.get(row.channel_id);
    if (group !== "online" && group !== "offline") continue;
    const key = `${row.sku_id}:${row.sale_month}`;
    const bucket = actualByGroup[group];
    const prev = bucket.get(key) ?? { qty: 0, post_tax: 0 };
    prev.qty += Number(row.qty);
    prev.post_tax += postTaxFromWmsNet(Number(row.net_sales));
    bucket.set(key, prev);
  }

  const plansByGroup = {
    online: new Map<
      string,
      { projected_qty: number; avg_discount_pct: number }
    >(),
    offline: new Map<
      string,
      { projected_qty: number; avg_discount_pct: number }
    >(),
  };
  for (const row of plansRes.data ?? []) {
    const group = row.sop_group as SopChannelGroup;
    if (group !== "online" && group !== "offline") continue;
    plansByGroup[group].set(`${row.sku_id}:${row.month}`, {
      projected_qty: Number(row.projected_qty),
      avg_discount_pct: Number(row.avg_discount_pct),
    });
  }

  const neededIds = new Set<string>();
  for (const group of SOP_GROUPS) {
    for (const key of actualByGroup[group].keys()) {
      neededIds.add(key.split(":")[0]!);
    }
    for (const key of plansByGroup[group].keys()) {
      neededIds.add(key.split(":")[0]!);
    }
  }
  await loadSkuMetaByIds(supabase, [...neededIds], skuMeta);

  const groupMonthBuckets: Record<
    SopChannelGroup,
    Map<number, MonthBucket>
  > = {
    online: new Map(),
    offline: new Map(),
  };
  const combinedMonthBuckets = new Map<number, MonthBucket>();

  for (const group of SOP_GROUPS) {
    const keys = new Set([
      ...actualByGroup[group].keys(),
      ...plansByGroup[group].keys(),
    ]);

    for (const key of keys) {
      const [skuId, monthStr] = key.split(":");
      if (!skuId || !monthStr) continue;
      const month = Number(monthStr);
      if (!completedSet.has(month)) continue;

      const plan = plansByGroup[group].get(key);
      const actual = actualByGroup[group].get(key) ?? {
        qty: 0,
        post_tax: 0,
      };
      const planQty = plan?.projected_qty ?? 0;
      const actualQty = actual.qty;
      if (planQty <= 0 && actualQty <= 0) continue;

      const meta = skuMeta.get(skuId) ?? {
        id: skuId,
        sku_code: skuId.slice(0, 8),
        name: null,
        is_bundle: false,
        retail_price: null,
        franchise_name: null,
      };
      const planPostTax = postTaxNet(
        vatInclusiveNet(
          planQty,
          meta.retail_price,
          plan?.avg_discount_pct ?? 0,
        ),
      );
      const qtyPoint = { plan: planQty, actual: actualQty };
      const netPoint = { plan: planPostTax, actual: actual.post_tax };

      let monthBucket = groupMonthBuckets[group].get(month);
      if (!monthBucket) {
        monthBucket = emptyMonthBucket();
        groupMonthBuckets[group].set(month, monthBucket);
      }
      monthBucket.qtyPoints.push(qtyPoint);
      monthBucket.netPoints.push(netPoint);
      pushPointToSku(monthBucket.bySku, meta, qtyPoint, netPoint);

      let combinedBucket = combinedMonthBuckets.get(month);
      if (!combinedBucket) {
        combinedBucket = emptyMonthBucket();
        combinedMonthBuckets.set(month, combinedBucket);
      }
      combinedBucket.qtyPoints.push(qtyPoint);
      combinedBucket.netPoints.push(netPoint);
      pushPointToSku(combinedBucket.bySku, meta, qtyPoint, netPoint);
    }
  }

  const groups = {} as Record<SopChannelGroup, SalesAccuracyGroupSummary>;
  for (const group of SOP_GROUPS) {
    groups[group] = buildGroupFromBuckets(
      group,
      completed_months,
      groupMonthBuckets[group],
    );
  }

  return {
    year,
    current_month,
    completed_months,
    groups,
    combined: buildGroupFromBuckets(
      "combined",
      completed_months,
      combinedMonthBuckets,
    ),
  };
}
