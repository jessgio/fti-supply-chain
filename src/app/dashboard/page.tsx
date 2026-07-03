import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedGrowthAnalytics } from "@/lib/analytics/growth-cache";
import { computeGrowthMetrics } from "@/lib/analytics/growth";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import { formatCurrency, formatNumber, formatPct } from "@/lib/utils";

export const revalidate = 120;

const steps = [
  {
    title: "Upload SKU mappings",
    description:
      "Define product franchises and bundle component breakdowns before importing sales.",
    href: "/dashboard/uploads",
  },
  {
    title: "Import sales & stock",
    description:
      "Excel files with channel, SKU, quantity sold, net sales, and warehouse stock.",
    href: "/dashboard/uploads",
  },
  {
    title: "Review franchise growth",
    description: "MoM and YoY trends by channel across day, week, month, year.",
    href: "/dashboard/sales",
  },
  {
    title: "Plan restocks",
    description:
      "Run demand forecasts, then raise purchase orders and track deliveries.",
    href: "/dashboard/procurement",
  },
];

interface Overview {
  reorderNow: number;
  stockoutSoon: number;
  skuCount: number;
  openPos: number;
  unitsOnOrder: number;
  inventoryValue: number;
  salesMomPct: number | null;
  latestStockDate: string | null;
}

async function loadOverview(): Promise<Overview | null> {
  try {
    const supabase = createAdminClient();

    const [{ recommendations, skuCount }, posRes, stockRes, salesMomPct] =
      await Promise.all([
        loadRestockRecommendations(supabase),
        supabase
          .from("purchase_orders")
          .select("status, purchase_order_lines(qty_ordered, qty_received)")
          .in("status", [
            "planned",
            "ordered",
            "in_production",
            "in_transit",
          ]),
        supabase
          .from("stock_levels")
          .select("as_of_date")
          .order("as_of_date", { ascending: false })
          .limit(1),
        loadSalesMom(),
      ]);

    const reorderNow = recommendations.filter(
      (r) =>
        !r.covered_by_po &&
        r.days_until_stockout !== null &&
        r.days_until_stockout <= r.reorder_lead_days,
    ).length;
    const stockoutSoon = recommendations.filter(
      (r) => r.days_until_stockout !== null && r.days_until_stockout <= 30,
    ).length;

    const skuCodes = [...new Set(recommendations.map((r) => r.sku_code))];
    const retailBySku = new Map<string, number>();
    const CHUNK = 500;
    const chunks: string[][] = [];
    for (let i = 0; i < skuCodes.length; i += CHUNK) {
      chunks.push(skuCodes.slice(i, i + CHUNK));
    }
    const skuPriceResults = await Promise.all(
      chunks.map((codes) =>
        supabase.from("skus").select("sku_code, retail_price").in("sku_code", codes),
      ),
    );
    for (const { data } of skuPriceResults) {
      for (const s of (data ?? []) as {
        sku_code: string;
        retail_price: number | null;
      }[]) {
        retailBySku.set(s.sku_code, Number(s.retail_price ?? 0));
      }
    }
    const inventoryValue = recommendations.reduce(
      (sum, r) =>
        sum + Math.max(0, r.current_stock) * (retailBySku.get(r.sku_code) ?? 0),
      0,
    );

    const pos = (posRes.data ?? []) as {
      status: string;
      purchase_order_lines: { qty_ordered: number; qty_received: number }[];
    }[];
    const openPos = pos.length;
    const unitsOnOrder = pos
      .filter((p) =>
        ["ordered", "in_production", "in_transit"].includes(p.status),
      )
      .reduce(
        (sum, p) =>
          sum +
          (p.purchase_order_lines ?? []).reduce(
            (s, l) => s + Math.max(0, Number(l.qty_ordered) - Number(l.qty_received)),
            0,
          ),
        0,
      );

    return {
      reorderNow,
      stockoutSoon,
      skuCount,
      openPos,
      unitsOnOrder,
      inventoryValue,
      salesMomPct,
      latestStockDate:
        (stockRes.data?.[0] as { as_of_date?: string } | undefined)
          ?.as_of_date ?? null,
    };
  } catch {
    return null;
  }
}

async function loadSalesMom(): Promise<number | null> {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const { points, coverage } = await getCachedGrowthAnalytics({
      grain: "month",
      from: threeMonthsAgo.toISOString().slice(0, 10),
    })();
    return computeGrowthMetrics(points, "month", "sales", coverage)
      .salesMomPct;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const overview = await loadOverview();

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div>
        <Badge className="mb-3 bg-emerald-100 text-emerald-800">
          From This Island
        </Badge>
        <h1 className="text-3xl font-semibold text-stone-900">
          Supply chain command center
        </h1>
        <p className="mt-2 max-w-2xl text-stone-600">
          Live view of replenishment risk, open orders, and commercial momentum
          for the supply chain, sales, and marketing teams.
        </p>
      </div>

      {overview ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Reorder now"
              value={formatNumber(overview.reorderNow)}
              hint="SKUs at risk within lead time"
              tone={overview.reorderNow > 0 ? "danger" : "success"}
            />
            <StatCard
              label="Stockout < 30 days"
              value={formatNumber(overview.stockoutSoon)}
              hint="On current burn rate"
              tone={overview.stockoutSoon > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Open purchase orders"
              value={formatNumber(overview.openPos)}
              hint={`${formatNumber(overview.unitsOnOrder)} units on order`}
              tone="info"
            />
            <StatCard
              label="Inventory value"
              value={formatCurrency(overview.inventoryValue)}
              hint="On-hand stock at retail price"
            />
            <StatCard
              label="Net sales MoM"
              value={formatPct(overview.salesMomPct)}
              hint="Latest vs previous month"
              tone={
                overview.salesMomPct == null
                  ? "default"
                  : overview.salesMomPct >= 0
                    ? "success"
                    : "danger"
              }
            />
            <StatCard
              label="SKUs tracked"
              value={formatNumber(overview.skuCount)}
              hint={
                overview.latestStockDate
                  ? `Stock as of ${overview.latestStockDate}`
                  : "No stock data yet"
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link href="/dashboard/inventory">
              <Card className="h-full transition-colors hover:border-emerald-300">
                <CardHeader>
                  <CardTitle>Inventory & forecast</CardTitle>
                  <CardDescription>
                    Triage restock risk, reorder points, and stockout dates.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/dashboard/procurement">
              <Card className="h-full transition-colors hover:border-emerald-300">
                <CardHeader>
                  <CardTitle>Procurement</CardTitle>
                  <CardDescription>
                    Raise purchase orders and record incoming deliveries.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/dashboard/commercial">
              <Card className="h-full transition-colors hover:border-emerald-300">
                <CardHeader>
                  <CardTitle>Sales & marketing</CardTitle>
                  <CardDescription>
                    Channel mix, top movers, and hot sellers running low.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Connect your data</CardTitle>
            <CardDescription>
              Live KPIs appear once Supabase is configured and data is uploaded.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            Recommended setup order for accurate franchise aggregation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step, index) => (
            <Link
              key={step.title}
              href={step.href}
              className="flex items-center justify-between rounded-lg border border-stone-200 px-4 py-3 transition-colors hover:bg-stone-50"
            >
              <div>
                <p className="font-medium text-stone-900">
                  {index + 1}. {step.title}
                </p>
                <p className="text-sm text-stone-500">{step.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-stone-400" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
