import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { getCompletedMonthBounds } from "@/lib/forecast/demand";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import {
  MONTHS,
  OFFLINE_SALES_LAG_MONTHS,
  SOP_GROUPS,
  type SopChannelGroup,
} from "@/lib/sales-forecast/constants";
import {
  impliedDiscountPct,
  postTaxFromWmsNet,
  postTaxNet,
  remainingYearShortfall,
  vatInclusiveNet,
} from "@/lib/sales-forecast/math";
import { STOCK_AGGREGATE_LOCATIONS } from "@/lib/stock/locations";
import { nestBundleBoms } from "@/lib/sales-forecast/franchise-rollup";
import {
  loadSkuRetailPriceHistory,
  rspByMonthForYear,
  type SkuPriceHistoryRow,
} from "@/lib/db/sku-retail-prices";
import { fetchAllRows, fetchAllRpc } from "@/lib/supabase/fetch-all";
import { listForecastPendingSkus } from "@/lib/db/sales-forecast-pending";
import type {
  SopBomComponent,
  SopForecastPayload,
  SopForecastUpload,
  SopMonthPlan,
  SopSkuRow,
  SopYearForecast,
} from "@/types/database";

interface EligibleSku {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  retail_price: number | null;
  franchise_name: string | null;
}

const FORECAST_SKU_SELECT =
  "id, sku_code, name, is_bundle, is_packaging, is_extract, is_active, franchise_id, retail_price, product_franchises(name)";

type ForecastSkuRow = {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_extract: boolean;
  is_active: boolean;
  franchise_id: string | null;
  retail_price: number | null;
  product_franchises: { name: string } | { name: string }[] | null;
};

function mapEligibleSku(row: ForecastSkuRow): EligibleSku | null {
  if (row.is_packaging || row.is_extract) return null;
  if (!row.is_bundle && !row.franchise_id) return null;
  const franchise = row.product_franchises;
  const franchiseName = Array.isArray(franchise)
    ? (franchise[0]?.name ?? null)
    : (franchise?.name ?? null);
  return {
    id: row.id,
    sku_code: row.sku_code,
    name: row.name,
    is_bundle: row.is_bundle,
    retail_price: row.retail_price == null ? null : Number(row.retail_price),
    franchise_name: row.is_bundle ? null : franchiseName,
  };
}

export function isSopGroup(value: string): value is SopChannelGroup {
  return value === "online" || value === "offline";
}

export async function listSalesChannels(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("sales_channels")
    .select("id, name, sop_group")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    name: string;
    sop_group: SopChannelGroup | null;
  }>;
}

export async function saveChannelGroups(
  supabase: SupabaseClient,
  updates: Array<{ id: string; sop_group: SopChannelGroup | null }>,
): Promise<void> {
  for (const row of updates) {
    const { error } = await supabase
      .from("sales_channels")
      .update({ sop_group: row.sop_group })
      .eq("id", row.id);
    if (error) throw error;
  }
}

export async function listEligibleSkus(
  supabase: SupabaseClient,
): Promise<EligibleSku[]> {
  const rows = await fetchAllRows<ForecastSkuRow>(() =>
    supabase
      .from("skus")
      .select(FORECAST_SKU_SELECT)
      .eq("is_active", true)
      .eq("is_packaging", false)
      .eq("is_extract", false)
      .or("is_bundle.eq.true,franchise_id.not.is.null")
      .order("sku_code"),
  );

  return rows
    .map(mapEligibleSku)
    .filter((row): row is EligibleSku => row != null);
}

const ID_CHUNK = 100;

export async function listSellableSkusByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<EligibleSku[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const rows: ForecastSkuRow[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const page = await fetchAllRows<ForecastSkuRow>(() =>
      supabase.from("skus").select(FORECAST_SKU_SELECT).in("id", chunk),
    );
    rows.push(...page);
  }

  return rows
    .map(mapEligibleSku)
    .filter((row): row is EligibleSku => row != null);
}

async function loadStockBySkuId(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const { data: latest, error: latestError } = await supabase
    .from("stock_levels")
    .select("as_of_date")
    .in("location", [...STOCK_AGGREGATE_LOCATIONS])
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latest?.as_of_date) return new Map();

  const rows = await fetchAllRows<{ sku_id: string; qty_on_hand: number }>(
    () =>
      supabase
        .from("stock_levels")
        .select("sku_id, qty_on_hand")
        .eq("as_of_date", latest.as_of_date)
        .in("location", [...STOCK_AGGREGATE_LOCATIONS]),
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.sku_id, (map.get(row.sku_id) ?? 0) + Number(row.qty_on_hand));
  }
  return map;
}

async function loadOnOrderBySkuId(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("get_on_order_qty_by_sku");
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    sku_id: string;
    on_order_qty: number;
  }>) {
    map.set(row.sku_id, Number(row.on_order_qty));
  }
  return map;
}

function windowAverage(
  actualBySkuMonth: Map<string, { qty: number; post_tax: number }>,
  skuId: string,
  start: string,
  months: number,
): { qty: number; post_tax: number } {
  let qty = 0;
  let postTax = 0;
  const startYear = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7));
  for (let i = 0; i < months; i += 1) {
    const date = new Date(startYear, startMonth - 1 + i, 1);
    const key = `${skuId}:${date.getFullYear()}-${date.getMonth() + 1}`;
    const actual = actualBySkuMonth.get(key);
    qty += actual?.qty ?? 0;
    postTax += actual?.post_tax ?? 0;
  }
  return { qty: qty / months, post_tax: postTax / months };
}

/** How many calendar months in the window have qty &gt; 0. */
function monthsWithSales(
  actualBySkuMonth: Map<string, { qty: number; post_tax: number }>,
  skuId: string,
  start: string,
  months: number,
): number {
  let count = 0;
  const startYear = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7));
  for (let i = 0; i < months; i += 1) {
    const date = new Date(startYear, startMonth - 1 + i, 1);
    const key = `${skuId}:${date.getFullYear()}-${date.getMonth() + 1}`;
    const actual = actualBySkuMonth.get(key);
    if ((actual?.qty ?? 0) > 0) count += 1;
  }
  return count;
}

/** Buildable bundle units = min over BOM of floor(component stock / qty per bundle). */
function bundleStockFromBom(
  components: SopBomComponent[],
  stockBySku: Map<string, number>,
): number {
  if (components.length === 0) return 0;
  let min = Infinity;
  for (const component of components) {
    const qtyPer = component.qty_per_bundle;
    if (!Number.isFinite(qtyPer) || qtyPer <= 0) continue;
    const onHand = stockBySku.get(component.sku_id) ?? 0;
    const buildable = Math.floor(onHand / qtyPer);
    if (buildable < min) min = buildable;
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

function buildGroupRows(
  skus: EligibleSku[],
  year: number,
  currentYear: number,
  currentMonth: number,
  l3mStart: string,
  l6mStart: string,
  actualBySkuMonth: Map<string, { qty: number; post_tax: number }>,
  planBySkuMonth: Map<
    string,
    { projected_qty: number; avg_discount_pct: number; upload_id: string | null }
  >,
  stockBySku: Map<string, number>,
  onOrderBySku: Map<string, number>,
  oosByCode: Map<string, string | null>,
  bomByBundle: Map<string, SopBomComponent[]>,
  priceHistory: Map<string, SkuPriceHistoryRow[]>,
): { rows: SopSkuRow[]; plannedByMonth: Map<number, number> } {
  const plannedByMonth = new Map<number, number>();
  const rows: SopSkuRow[] = skus.map((sku) => {
    const l3m = windowAverage(actualBySkuMonth, sku.id, l3mStart, 3);
    const l6m = windowAverage(actualBySkuMonth, sku.id, l6mStart, 6);
    const l3m_months_with_sales = monthsWithSales(
      actualBySkuMonth,
      sku.id,
      l3mStart,
      3,
    );
    const months: SopSkuRow["months"] = {};
    let remainingYearQty = 0;
    const rsp_by_month = rspByMonthForYear(
      priceHistory.get(sku.id) ?? [],
      year,
      sku.retail_price,
    );
    for (const month of MONTHS) {
      const actual = actualBySkuMonth.get(`${sku.id}:${year}-${month}`) ?? {
        qty: 0,
        post_tax: 0,
      };
      const stored = planBySkuMonth.get(`${sku.id}:${month}`);
      const projected_qty = stored?.projected_qty ?? 0;
      const avg_discount_pct = stored?.avg_discount_pct ?? 0;
      const monthRsp = rsp_by_month[month] ?? null;
      const vat_in = vatInclusiveNet(
        projected_qty,
        monthRsp,
        avg_discount_pct,
      );
      const plan: SopMonthPlan = {
        projected_qty,
        avg_discount_pct,
        vat_in_net: vat_in,
        post_tax_net: postTaxNet(vat_in),
        upload_id: stored?.upload_id ?? null,
      };
      months[month] = {
        actual: {
          qty: actual.qty,
          post_tax_net: actual.post_tax,
          avg_discount_pct: impliedDiscountPct(
            actual.qty,
            monthRsp,
            actual.post_tax,
          ),
        },
        plan,
      };
      plannedByMonth.set(
        month,
        (plannedByMonth.get(month) ?? 0) + plan.post_tax_net,
      );
      const isRemaining =
        year > currentYear ||
        (year === currentYear && month >= currentMonth);
      if (isRemaining) remainingYearQty += projected_qty;
    }
    const bom_components = sku.is_bundle
      ? nestBundleBoms(
          bomByBundle.get(sku.id) ?? [],
          bomByBundle,
          new Set([sku.id]),
        )
      : [];
    const current_stock = sku.is_bundle
      ? bundleStockFromBom(bom_components, stockBySku)
      : (stockBySku.get(sku.id) ?? 0);
    const on_order_qty = onOrderBySku.get(sku.id) ?? 0;
    return {
      sku_id: sku.id,
      sku_code: sku.sku_code,
      name: sku.name,
      is_bundle: sku.is_bundle,
      bom_components,
      franchise_name: sku.franchise_name,
      retail_price: sku.retail_price,
      rsp_by_month,
      current_stock,
      on_order_qty,
      projected_stockout_date: oosByCode.get(sku.sku_code) ?? null,
      l3m_qty: l3m.qty,
      l3m_post_tax: l3m.post_tax,
      l6m_qty: l6m.qty,
      l6m_post_tax: l6m.post_tax,
      l3m_months_with_sales,
      is_npd: l3m_months_with_sales < 3,
      remaining_year_qty: remainingYearQty,
      shortfall_qty: remainingYearShortfall(
        remainingYearQty,
        current_stock,
        on_order_qty,
      ),
      months,
    };
  });
  return { rows, plannedByMonth };
}

export async function loadSopYearForecast(
  supabase: SupabaseClient,
  year: number,
): Promise<SopYearForecast> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const onlineBounds = getCompletedMonthBounds(now);
  const offlineBounds = getCompletedMonthBounds(now, OFFLINE_SALES_LAG_MONTHS);
  const current_month =
    year > currentYear ? 1 : year === currentYear ? currentMonth : 13;
  const read_only = year < currentYear;

  const channels = await listSalesChannels(supabase);
  const unmapped_channel_count = channels.filter((c) => !c.sop_group).length;
  const channelGroup = new Map(
    channels.map((c) => [c.id, c.sop_group] as const),
  );
  const mappedChannelIds = new Set(
    channels.filter((c) => c.sop_group).map((c) => c.id),
  );

  const yearStart = `${year}-01-01`;
  const today = format(now, "yyyy-MM-dd");
  const historyStart = [onlineBounds.l6mStart, offlineBounds.l6mStart, yearStart]
    .sort()[0]!;

  const [
    eligibleSkus,
    stockBySku,
    onOrderBySku,
    targetsRes,
    planRows,
    uploadsRes,
    monthlyActualsRes,
    restockResult,
    inactiveRes,
    bomRows,
    priceHistory,
    pendingSkus,
  ] = await Promise.all([
    listEligibleSkus(supabase),
    loadStockBySkuId(supabase),
    loadOnOrderBySkuId(supabase),
    supabase
      .from("sop_monthly_targets")
      .select("month, target_net_sales_post_tax, sop_group")
      .eq("year", year),
    fetchAllRows<{
      sku_id: string;
      month: number;
      projected_qty: number;
      avg_discount_pct: number;
      upload_id: string | null;
      sop_group: string;
    }>(() =>
      supabase
        .from("sop_sku_month_plans")
        .select(
          "sku_id, month, projected_qty, avg_discount_pct, upload_id, sop_group",
        )
        .eq("year", year),
    ),
    supabase
      .from("sop_forecast_uploads")
      .select(
        "id, sop_group, year, filename, row_count, uploaded_by, created_at",
      )
      .eq("year", year)
      .order("created_at", { ascending: false }),
    mappedChannelIds.size > 0
      ? fetchAllRpc<{
          sku_id: string;
          channel_id: string;
          sale_year: number;
          sale_month: number;
          qty: number;
          net_sales: number;
        }>(supabase, "get_sop_monthly_actuals", {
          p_start: historyStart,
          p_end: today,
        }).then((data) => ({ data, error: null as null }))
      : Promise.resolve({
          data: [] as Array<{
            sku_id: string;
            channel_id: string;
            sale_year: number;
            sale_month: number;
            qty: number;
            net_sales: number;
          }>,
          error: null as null,
        }),
    loadRestockRecommendations(supabase).catch(() => ({
      recommendations: [] as Awaited<
        ReturnType<typeof loadRestockRecommendations>
      >["recommendations"],
      skuCount: 0,
    })),
    supabase
      .from("sop_sku_channel_inactive")
      .select("sku_id, sop_group"),
    fetchAllRows<{
      bundle_sku_id: string;
      component_sku_id: string;
      qty_per_bundle: number;
      component: {
        sku_code: string;
        retail_price: number | null;
        product_franchises: { name: string } | { name: string }[] | null;
      } | {
        sku_code: string;
        retail_price: number | null;
        product_franchises: { name: string } | { name: string }[] | null;
      }[] | null;
    }>(() =>
      supabase
        .from("bundle_components")
        .select(
          "bundle_sku_id, component_sku_id, qty_per_bundle, component:component_sku_id(sku_code, retail_price, product_franchises(name))",
        )
        .order("created_at"),
    ),
    loadSkuRetailPriceHistory(supabase),
    listForecastPendingSkus(supabase, year),
  ]);
  if (targetsRes.error) throw targetsRes.error;
  if (uploadsRes.error) throw uploadsRes.error;
  if (inactiveRes.error) throw inactiveRes.error;

  const knownSkuIds = new Set(eligibleSkus.map((sku) => sku.id));
  const extraPlanIds = [
    ...new Set(planRows.map((row) => row.sku_id)),
  ].filter((id) => !knownSkuIds.has(id));
  const extraSkus =
    extraPlanIds.length > 0
      ? await listSellableSkusByIds(supabase, extraPlanIds)
      : [];
  const skus =
    extraSkus.length === 0
      ? eligibleSkus
      : [...eligibleSkus, ...extraSkus].sort((a, b) =>
          a.sku_code.localeCompare(b.sku_code),
        );

  const bomByBundle = new Map<string, SopBomComponent[]>();
  for (const row of bomRows) {
    const component = Array.isArray(row.component)
      ? row.component[0]
      : row.component;
    const code = component?.sku_code;
    if (!code || !row.component_sku_id) continue;
    const franchise = component?.product_franchises;
    const franchiseName = Array.isArray(franchise)
      ? (franchise[0]?.name ?? null)
      : (franchise?.name ?? null);
    const list = bomByBundle.get(row.bundle_sku_id) ?? [];
    list.push({
      sku_id: row.component_sku_id,
      sku_code: code,
      qty_per_bundle: Number(row.qty_per_bundle),
      franchise_name: franchiseName,
      retail_price:
        component?.retail_price == null ? null : Number(component.retail_price),
    });
    bomByBundle.set(row.bundle_sku_id, list);
  }
  for (const [, list] of bomByBundle) {
    list.sort((a, b) => a.sku_code.localeCompare(b.sku_code));
  }

  const skuIds = new Set(skus.map((s) => s.id));
  const actualByGroup = {
    online: new Map<string, { qty: number; post_tax: number }>(),
    offline: new Map<string, { qty: number; post_tax: number }>(),
  };

  for (const row of monthlyActualsRes.data ?? []) {
    if (!skuIds.has(row.sku_id)) continue;
    if (!mappedChannelIds.has(row.channel_id)) continue;
    const group = channelGroup.get(row.channel_id);
    if (group !== "online" && group !== "offline") continue;
    const key = `${row.sku_id}:${row.sale_year}-${row.sale_month}`;
    const bucket = actualByGroup[group];
    const prev = bucket.get(key) ?? { qty: 0, post_tax: 0 };
    prev.qty += Number(row.qty);
    prev.post_tax += postTaxFromWmsNet(Number(row.net_sales));
    bucket.set(key, prev);
  }

  const oosByCode = new Map(
    restockResult.recommendations.map((r) => [
      r.sku_code,
      r.projected_stockout_date,
    ]),
  );

  const plansByGroup = {
    online: new Map<
      string,
      { projected_qty: number; avg_discount_pct: number; upload_id: string | null }
    >(),
    offline: new Map<
      string,
      { projected_qty: number; avg_discount_pct: number; upload_id: string | null }
    >(),
  };
  for (const row of planRows) {
    const group = row.sop_group as SopChannelGroup;
    if (group !== "online" && group !== "offline") continue;
    plansByGroup[group].set(`${row.sku_id}:${row.month}`, {
      projected_qty: Number(row.projected_qty),
      avg_discount_pct: Number(row.avg_discount_pct),
      upload_id: row.upload_id ?? null,
    });
  }

  const targetsByGroup = {
    online: new Map<number, number>(),
    offline: new Map<number, number>(),
  };
  for (const row of targetsRes.data ?? []) {
    const group = row.sop_group as SopChannelGroup;
    if (group !== "online" && group !== "offline") continue;
    targetsByGroup[group].set(
      Number(row.month),
      Number(row.target_net_sales_post_tax),
    );
  }

  const uploads = (uploadsRes.data ?? []) as SopForecastUpload[];

  const inactive_sku_ids: Record<SopChannelGroup, string[]> = {
    online: [],
    offline: [],
  };
  const inactiveByGroup = {
    online: new Set<string>(),
    offline: new Set<string>(),
  };
  for (const row of inactiveRes.data ?? []) {
    const group = row.sop_group as SopChannelGroup;
    if (group !== "online" && group !== "offline") continue;
    inactiveByGroup[group].add(row.sku_id as string);
    inactive_sku_ids[group].push(row.sku_id as string);
  }

  const eligible_skus = skus.map((sku) => ({
    sku_id: sku.id,
    sku_code: sku.sku_code,
    name: sku.name,
    is_bundle: sku.is_bundle,
    franchise_name: sku.franchise_name,
  }));

  const groups = {} as Record<SopChannelGroup, SopForecastPayload>;
  for (const group of SOP_GROUPS) {
    const bounds = group === "offline" ? offlineBounds : onlineBounds;
    const activeSkus = skus.filter((sku) => !inactiveByGroup[group].has(sku.id));
    const inactiveSkus = skus.filter((sku) => inactiveByGroup[group].has(sku.id));
    const { rows, plannedByMonth } = buildGroupRows(
      activeSkus,
      year,
      currentYear,
      currentMonth,
      bounds.l3mStart,
      bounds.l6mStart,
      actualByGroup[group],
      plansByGroup[group],
      stockBySku,
      onOrderBySku,
      oosByCode,
      bomByBundle,
      priceHistory,
    );
    const { rows: inactive_rows } = buildGroupRows(
      inactiveSkus,
      year,
      currentYear,
      currentMonth,
      bounds.l3mStart,
      bounds.l6mStart,
      actualByGroup[group],
      plansByGroup[group],
      stockBySku,
      onOrderBySku,
      oosByCode,
      bomByBundle,
      priceHistory,
    );
    groups[group] = {
      year,
      group,
      current_month,
      read_only,
      unmapped_channel_count,
      channels,
      targets: MONTHS.map((month) => {
        const target = targetsByGroup[group].get(month) ?? 0;
        const planned = plannedByMonth.get(month) ?? 0;
        return {
          month,
          target_net_sales_post_tax: target,
          planned_post_tax: planned,
          gap: planned - target,
        };
      }),
      rows,
      inactive_rows,
      pending_skus: pendingSkus.filter((sku) => sku.sop_group === group),
      uploads: uploads.filter((u) => u.sop_group === group),
      inactive_sku_ids: inactive_sku_ids[group],
    };
  }

  return {
    year,
    current_month,
    read_only,
    unmapped_channel_count,
    channels,
    eligible_skus,
    inactive_sku_ids,
    groups,
  };
}

export async function loadSopForecast(
  supabase: SupabaseClient,
  year: number,
  group: SopChannelGroup,
): Promise<SopForecastPayload> {
  const yearData = await loadSopYearForecast(supabase, year);
  return yearData.groups[group];
}

export async function upsertMonthlyTargets(
  supabase: SupabaseClient,
  input: {
    year: number;
    group: SopChannelGroup;
    targets: Array<{ month: number; target_net_sales_post_tax: number }>;
    userId: string | null;
  },
): Promise<void> {
  const rows = input.targets
    .filter((t) => t.month >= 1 && t.month <= 12)
    .map((t) => ({
      year: input.year,
      month: t.month,
      sop_group: input.group,
      target_net_sales_post_tax: Number.isFinite(t.target_net_sales_post_tax)
        ? t.target_net_sales_post_tax
        : 0,
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("sop_monthly_targets")
    .upsert(rows, { onConflict: "year,month,sop_group" });
  if (error) throw error;
}

export async function upsertSkuMonthPlans(
  supabase: SupabaseClient,
  input: {
    year: number;
    group: SopChannelGroup;
    lines: Array<{
      sku_id: string;
      month: number;
      projected_qty: number;
      avg_discount_pct: number;
    }>;
    userId: string | null;
    uploadId?: string | null;
    keepExistingUploadId?: boolean;
  },
): Promise<string[]> {
  if (input.lines.length === 0) return [];
  const existingUploadByKey = new Map<string, string | null>();
  const skuIds = [...new Set(input.lines.map((l) => l.sku_id))];
  if (input.keepExistingUploadId) {
    const chunk = 80;
    for (let i = 0; i < skuIds.length; i += chunk) {
      const { data, error } = await supabase
        .from("sop_sku_month_plans")
        .select("sku_id, month, upload_id")
        .eq("year", input.year)
        .eq("sop_group", input.group)
        .in("sku_id", skuIds.slice(i, i + chunk));
      if (error) throw error;
      for (const row of Array.isArray(data) ? data : []) {
        existingUploadByKey.set(
          `${row.sku_id}:${row.month}`,
          row.upload_id ?? null,
        );
      }
    }
  }

  const rows = input.lines
    .filter((l) => l.month >= 1 && l.month <= 12)
    .map((l) => ({
      year: input.year,
      month: l.month,
      sop_group: input.group,
      sku_id: l.sku_id,
      projected_qty: l.projected_qty,
      avg_discount_pct: Math.min(100, Math.max(0, l.avg_discount_pct)),
      upload_id: input.keepExistingUploadId
        ? (existingUploadByKey.get(`${l.sku_id}:${l.month}`) ?? null)
        : (input.uploadId ?? null),
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
    }));

  const upsertChunk = 500;
  for (let i = 0; i < rows.length; i += upsertChunk) {
    const { error } = await supabase
      .from("sop_sku_month_plans")
      .upsert(rows.slice(i, i + upsertChunk), {
        onConflict: "year,month,sop_group,sku_id",
      });
    if (error) throw error;
  }
  return [...new Set(rows.map((r) => r.sku_id))];
}

export async function createForecastUpload(
  supabase: SupabaseClient,
  input: {
    group: SopChannelGroup;
    year: number;
    filename: string;
    rowCount: number;
    userId: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("sop_forecast_uploads")
    .insert({
      sop_group: input.group,
      year: input.year,
      filename: input.filename,
      row_count: input.rowCount,
      uploaded_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteForecastUpload(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("sop_forecast_uploads")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Replace the inactive SKU set for one Online/Offline group. */
export async function replaceChannelInactiveSkus(
  supabase: SupabaseClient,
  input: {
    group: SopChannelGroup;
    skuIds: string[];
    userId: string | null;
  },
): Promise<string[]> {
  const uniqueIds = [...new Set(input.skuIds.filter(Boolean))];

  const { error: deleteError } = await supabase
    .from("sop_sku_channel_inactive")
    .delete()
    .eq("sop_group", input.group);
  if (deleteError) throw deleteError;

  if (uniqueIds.length === 0) return [];

  const rows = uniqueIds.map((sku_id) => ({
    sku_id,
    sop_group: input.group,
    updated_by: input.userId,
    updated_at: new Date().toISOString(),
  }));
  const { error: insertError } = await supabase
    .from("sop_sku_channel_inactive")
    .insert(rows);
  if (insertError) throw insertError;
  return uniqueIds;
}
