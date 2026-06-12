import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listPurchaseOrders } from "@/lib/db/procurement";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import { stockStatusOf } from "@/lib/forecast/stock-status";
import { formatNumber } from "@/lib/utils";
import type { PoStatus, RestockRecommendation } from "@/types/database";

const DEFAULT_STOCKOUT_SOON_DAYS = 30;
const DEFAULT_UPCOMING_SHIPMENT_DAYS = 14;
const MAX_ITEMS_PER_SECTION = 12;

const OPEN_PO_STATUSES: PoStatus[] = ["planned", "ordered", "in_transit"];

export interface UpcomingShipmentAlert {
  po_number: string;
  supplier_name: string | null;
  status: PoStatus;
  expected_date: string;
  days_until_arrival: number;
  open_units: number;
  line_count: number;
}

export interface StockAlertReport {
  generated_at: string;
  low_stock: RestockRecommendation[];
  stockout_soon: RestockRecommendation[];
  upcoming_shipments: UpcomingShipmentAlert[];
}

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function openUnitsOnPo(
  lines: { qty_ordered: number; qty_received: number }[] | undefined,
): number {
  return (lines ?? []).reduce(
    (sum, line) => sum + Math.max(0, line.qty_ordered - line.qty_received),
    0,
  );
}

function truncateList<T>(items: T[], max = MAX_ITEMS_PER_SECTION): {
  shown: T[];
  remaining: number;
} {
  if (items.length <= max) return { shown: items, remaining: 0 };
  return { shown: items.slice(0, max), remaining: items.length - max };
}

function formatSkuLine(row: RestockRecommendation): string {
  const franchise = row.franchise_name ? ` (${row.franchise_name})` : "";
  const stockout =
    row.projected_stockout_date != null
      ? `stockout ${row.projected_stockout_date}`
      : row.days_until_stockout != null
        ? `${row.days_until_stockout}d left`
        : "stockout unknown";
  const restock =
    row.recommended_restock_qty > 0
      ? `, restock ${formatNumber(row.recommended_restock_qty)}`
      : "";
  const gap = row.has_stockout_gap ? ", gap before PO arrives" : "";
  return `- **${row.sku_code}**${franchise}: ${formatNumber(row.current_stock)} on hand, ${stockout}${restock}${gap}`;
}

function formatShipmentLine(shipment: UpcomingShipmentAlert): string {
  const supplier = shipment.supplier_name ? ` · ${shipment.supplier_name}` : "";
  return `- **${shipment.po_number}**${supplier}: ETA ${shipment.expected_date} (${shipment.days_until_arrival}d), ${formatNumber(shipment.open_units)} units, ${shipment.line_count} line(s), ${shipment.status.replace("_", " ")}`;
}

export async function buildStockAlertReport(
  supabase: SupabaseClient,
): Promise<StockAlertReport> {
  const stockoutSoonDays = readIntEnv(
    "LARK_ALERT_STOCKOUT_DAYS",
    DEFAULT_STOCKOUT_SOON_DAYS,
  );
  const upcomingDays = readIntEnv(
    "LARK_ALERT_SHIPMENT_DAYS",
    DEFAULT_UPCOMING_SHIPMENT_DAYS,
  );

  const [{ recommendations }, purchaseOrders] = await Promise.all([
    loadRestockRecommendations(supabase),
    listPurchaseOrders(supabase),
  ]);

  const lowStock = recommendations
    .filter((row) => stockStatusOf(row) === "reorder")
    .sort(
      (a, b) =>
        (a.days_until_stockout ?? Number.MAX_SAFE_INTEGER) -
        (b.days_until_stockout ?? Number.MAX_SAFE_INTEGER),
    );

  const stockoutSoon = recommendations
    .filter(
      (row) =>
        row.days_until_stockout !== null &&
        row.days_until_stockout <= stockoutSoonDays,
    )
    .sort((a, b) => (a.days_until_stockout ?? 0) - (b.days_until_stockout ?? 0));

  const today = todayIso();
  const horizon = format(addDays(parseISO(today), upcomingDays), "yyyy-MM-dd");

  const upcomingShipments = purchaseOrders
    .filter((po) => OPEN_PO_STATUSES.includes(po.status))
    .filter((po) => po.expected_date != null)
    .filter((po) => po.expected_date! >= today && po.expected_date! <= horizon)
    .map((po) => ({
      po_number: po.po_number,
      supplier_name: po.supplier_name ?? null,
      status: po.status,
      expected_date: po.expected_date!,
      days_until_arrival: differenceInCalendarDays(
        parseISO(po.expected_date!),
        parseISO(today),
      ),
      open_units: openUnitsOnPo(po.lines),
      line_count: (po.lines ?? []).filter(
        (line) => line.qty_ordered - line.qty_received > 0,
      ).length,
    }))
    .filter((po) => po.open_units > 0)
    .sort((a, b) => a.expected_date.localeCompare(b.expected_date));

  return {
    generated_at: new Date().toISOString(),
    low_stock: lowStock,
    stockout_soon: stockoutSoon,
    upcoming_shipments: upcomingShipments,
  };
}

export function reportHasAlerts(report: StockAlertReport): boolean {
  return (
    report.low_stock.length > 0 ||
    report.stockout_soon.length > 0 ||
    report.upcoming_shipments.length > 0
  );
}

function sectionMarkdown(
  title: string,
  lines: string[],
  remaining: number,
): string {
  if (lines.length === 0) return `**${title}:** none\n`;
  const tail =
    remaining > 0 ? `\n_…and ${remaining} more. See dashboard for full list._` : "";
  return `**${title} (${lines.length + remaining})**\n${lines.join("\n")}${tail}\n`;
}

function appDashboardUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/dashboard/inventory`;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}/dashboard/inventory`;
  return null;
}

export function buildStockAlertCard(
  report: StockAlertReport,
  stockoutSoonDays = readIntEnv(
    "LARK_ALERT_STOCKOUT_DAYS",
    DEFAULT_STOCKOUT_SOON_DAYS,
  ),
): Record<string, unknown> {
  const lowStock = truncateList(report.low_stock);
  const stockoutSoon = truncateList(report.stockout_soon);
  const shipments = truncateList(report.upcoming_shipments);

  const sections = [
    sectionMarkdown(
      "Low stock — reorder now",
      lowStock.shown.map(formatSkuLine),
      lowStock.remaining,
    ),
    sectionMarkdown(
      `Nearing stockout (≤${stockoutSoonDays} days)`,
      stockoutSoon.shown.map(formatSkuLine),
      stockoutSoon.remaining,
    ),
    sectionMarkdown(
      "Upcoming shipments",
      shipments.shown.map(formatShipmentLine),
      shipments.remaining,
    ),
  ].join("\n");

  const dashboardUrl = appDashboardUrl();
  const footer = dashboardUrl
    ? `\n[Open inventory dashboard](${dashboardUrl})`
    : "";

  const hasUrgent =
    report.low_stock.length > 0 || report.stockout_soon.length > 0;

  return {
    msg_type: "interactive",
    card: {
      header: {
        title: {
          tag: "plain_text",
          content: "FTI supply chain alerts",
        },
        template: hasUrgent ? "red" : "blue",
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `${sections}${footer}`,
          },
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: `Generated ${format(parseISO(report.generated_at), "yyyy-MM-dd HH:mm")} UTC`,
            },
          ],
        },
      ],
    },
  };
}
