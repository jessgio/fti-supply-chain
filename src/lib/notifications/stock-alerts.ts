import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listPurchaseOrders } from "@/lib/db/procurement";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import { stockStatusOf } from "@/lib/forecast/stock-status";
import { formatNumber } from "@/lib/utils";
import type { PoStatus, RestockRecommendation } from "@/types/database";

const DEFAULT_STOCKOUT_SOON_DAYS = 30;
const DEFAULT_UPCOMING_SHIPMENT_DAYS = 14;
const MAX_TABLE_ROWS = 10;

const OPEN_PO_STATUSES: PoStatus[] = [
  "planned",
  "ordered",
  "in_production",
  "in_transit",
];

type LarkElement = Record<string, unknown>;

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

function truncateList<T>(items: T[], max = MAX_TABLE_ROWS): {
  shown: T[];
  remaining: number;
} {
  if (items.length <= max) return { shown: items, remaining: 0 };
  return { shown: items.slice(0, max), remaining: items.length - max };
}

function stockoutLabel(row: RestockRecommendation): string {
  if (row.projected_stockout_date) {
    return row.has_stockout_gap
      ? `${row.projected_stockout_date} · gap`
      : row.projected_stockout_date;
  }
  if (row.days_until_stockout != null) {
    const days = `${row.days_until_stockout}d`;
    return row.has_stockout_gap ? `${days} · gap` : days;
  }
  return "—";
}

function appDashboardUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/dashboard/inventory`;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}/dashboard/inventory`;
  return null;
}

function markdownElement(
  content: string,
  textSize = "normal_v2",
  margin = "0px 0px 8px 0px",
): LarkElement {
  return {
    tag: "markdown",
    content,
    text_align: "left",
    text_size: textSize,
    margin,
  };
}

function hrElement(): LarkElement {
  return { tag: "hr", margin: "12px 0px" };
}

function summaryColumnSet(
  report: StockAlertReport,
  stockoutSoonDays: number,
): LarkElement {
  return {
    tag: "column_set",
    flex_mode: "bisect",
    background_style: "grey",
    horizontal_spacing: "8px",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "center",
        elements: [
          markdownElement(
            `**${report.low_stock.length}**\nReorder now`,
            "normal_v2",
            "8px 8px 8px 8px",
          ),
        ],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "center",
        elements: [
          markdownElement(
            `**${report.stockout_soon.length}**\nStockout ≤${stockoutSoonDays}d`,
            "normal_v2",
            "8px 8px 8px 8px",
          ),
        ],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "center",
        elements: [
          markdownElement(
            `**${report.upcoming_shipments.length}**\nShipments`,
            "normal_v2",
            "8px 8px 8px 8px",
          ),
        ],
      },
    ],
  };
}

function stockTable(
  elementId: string,
  rows: RestockRecommendation[],
): LarkElement {
  return {
    tag: "table",
    element_id: elementId,
    page_size: Math.min(MAX_TABLE_ROWS, Math.max(rows.length, 1)),
    row_height: "auto",
    row_max_height: "96px",
    header_style: {
      text_align: "left",
      text_size: "normal",
      background_style: "grey",
      bold: true,
    },
    columns: [
      {
        name: "sku",
        display_name: "SKU",
        data_type: "text",
        width: "32%",
        vertical_align: "top",
        horizontal_align: "left",
      },
      {
        name: "franchise",
        display_name: "Franchise",
        data_type: "text",
        width: "24%",
        vertical_align: "top",
        horizontal_align: "left",
      },
      {
        name: "on_hand",
        display_name: "Hand",
        data_type: "number",
        width: "14%",
        vertical_align: "top",
        horizontal_align: "right",
        format: { separator: true, precision: 0 },
      },
      {
        name: "stockout",
        display_name: "Stockout",
        data_type: "text",
        width: "18%",
        vertical_align: "top",
        horizontal_align: "left",
      },
      {
        name: "restock",
        display_name: "Restock",
        data_type: "number",
        width: "12%",
        vertical_align: "top",
        horizontal_align: "right",
        format: { separator: true, precision: 0 },
      },
    ],
    rows: rows.map((row) => ({
      sku: row.sku_code,
      franchise: row.franchise_name ?? "—",
      on_hand: row.current_stock,
      stockout: stockoutLabel(row),
      restock: row.recommended_restock_qty > 0 ? row.recommended_restock_qty : 0,
    })),
  };
}

function shipmentTable(
  elementId: string,
  rows: UpcomingShipmentAlert[],
): LarkElement {
  return {
    tag: "table",
    element_id: elementId,
    page_size: Math.min(MAX_TABLE_ROWS, Math.max(rows.length, 1)),
    row_height: "auto",
    row_max_height: "72px",
    header_style: {
      text_align: "left",
      text_size: "normal",
      background_style: "grey",
      bold: true,
    },
    columns: [
      {
        name: "po",
        display_name: "PO",
        data_type: "text",
        width: "24%",
        vertical_align: "top",
        horizontal_align: "left",
      },
      {
        name: "supplier",
        display_name: "Supplier",
        data_type: "text",
        width: "26%",
        vertical_align: "top",
        horizontal_align: "left",
      },
      {
        name: "eta",
        display_name: "ETA",
        data_type: "text",
        width: "18%",
        vertical_align: "top",
        horizontal_align: "left",
      },
      {
        name: "days",
        display_name: "Days",
        data_type: "number",
        width: "10%",
        vertical_align: "top",
        horizontal_align: "right",
        format: { precision: 0 },
      },
      {
        name: "units",
        display_name: "Units",
        data_type: "number",
        width: "12%",
        vertical_align: "top",
        horizontal_align: "right",
        format: { separator: true, precision: 0 },
      },
      {
        name: "status",
        display_name: "Status",
        data_type: "text",
        width: "10%",
        vertical_align: "top",
        horizontal_align: "left",
      },
    ],
    rows: rows.map((row) => ({
      po: row.po_number,
      supplier: row.supplier_name ?? "—",
      eta: row.expected_date,
      days: row.days_until_arrival,
      units: row.open_units,
      status: row.status.replace("_", " "),
    })),
  };
}

function sectionElements(
  title: string,
  totalCount: number,
  table: LarkElement | null,
  remaining: number,
): LarkElement[] {
  const elements: LarkElement[] = [
    markdownElement(`**${title}** · ${totalCount}`),
  ];

  if (table) {
    elements.push(table);
    if (remaining > 0) {
      elements.push(
        markdownElement(
          `_Showing top ${MAX_TABLE_ROWS}. ${remaining} more on the dashboard._`,
          "notation",
          "4px 0px 8px 0px",
        ),
      );
    }
  } else {
    elements.push(
      markdownElement("None in this category.", "notation", "0px 0px 8px 0px"),
    );
  }

  return elements;
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

  const hasUrgent =
    report.low_stock.length > 0 || report.stockout_soon.length > 0;

  const elements: LarkElement[] = [
    summaryColumnSet(report, stockoutSoonDays),
    hrElement(),
    ...sectionElements(
      "Low stock — reorder now",
      report.low_stock.length,
      lowStock.shown.length > 0
        ? stockTable("low_stock_table", lowStock.shown)
        : null,
      lowStock.remaining,
    ),
    hrElement(),
    ...sectionElements(
      `Nearing stockout (≤${stockoutSoonDays} days)`,
      report.stockout_soon.length,
      stockoutSoon.shown.length > 0
        ? stockTable("stockout_table", stockoutSoon.shown)
        : null,
      stockoutSoon.remaining,
    ),
    hrElement(),
    ...sectionElements(
      "Upcoming shipments",
      report.upcoming_shipments.length,
      shipments.shown.length > 0
        ? shipmentTable("shipments_table", shipments.shown)
        : null,
      shipments.remaining,
    ),
  ];

  const dashboardUrl = appDashboardUrl();
  if (dashboardUrl) {
    elements.push({
      tag: "button",
      text: {
        tag: "plain_text",
        content: "Open inventory dashboard",
      },
      type: "primary",
      width: "fill",
      size: "medium",
      behaviors: [
        {
          type: "open_url",
          default_url: dashboardUrl,
          pc_url: dashboardUrl,
          ios_url: dashboardUrl,
          android_url: dashboardUrl,
        },
      ],
      margin: "12px 0px 0px 0px",
    });
  }

  elements.push(
    markdownElement(
      `Generated ${format(parseISO(report.generated_at), "yyyy-MM-dd HH:mm")} UTC`,
      "notation",
      "8px 0px 0px 0px",
    ),
  );

  return {
    msg_type: "interactive",
    card: {
      schema: "2.0",
      config: {
        update_multi: true,
        style: {
          text_size: {
            normal_v2: {
              default: "normal",
              pc: "normal",
              mobile: "normal",
            },
          },
        },
      },
      header: {
        title: {
          tag: "plain_text",
          content: "FTI supply chain alerts",
        },
        subtitle: {
          tag: "plain_text",
          content: `${format(parseISO(report.generated_at), "yyyy-MM-dd")} · ${report.low_stock.length + report.stockout_soon.length + report.upcoming_shipments.length} items`,
        },
        template: hasUrgent ? "red" : "blue",
        padding: "12px 12px 12px 12px",
      },
      body: {
        direction: "vertical",
        padding: "12px 12px 12px 12px",
        elements,
      },
    },
  };
}
