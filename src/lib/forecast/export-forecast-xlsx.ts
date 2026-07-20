import type {
  NpdStockRow,
  ProductLinkedPackagingRow,
  RestockRecommendation,
} from "@/types/database";
import { DAYS_PER_MONTH } from "@/lib/forecast/demand";
import {
  STOCK_STATUS_BADGE,
  monthsOfCover,
  stockStatusOf,
} from "@/lib/forecast/stock-status";

export interface ForecastExportRow {
  Status: string;
  SKU: string;
  Franchise: string;
  Velocity: string;
  Pattern: string;
  Stock: number;
  "On order": number;
  "Fcst/day": number;
  "Fcst/mo": number;
  "DOI (days)": number | "";
  "DOI (months)": number | "";
  "On-hand stockout": string;
  "Next batch in": string;
  "Batch stockout": string;
  "Stockout gap": string;
  "Reorder point": number;
  "Restock qty": number;
  "Safety stock": number;
  "Lead time (days)": number;
  Confidence: string;
  "Covered by PO": string;
  "Needs reorder": string;
  "First sale date": string;
}

export interface NpdExportRow {
  SKU: string;
  Name: string;
  Franchise: string;
  "On hand": number;
  "Stock as of": string;
  "Incoming qty": number;
  "Next batch in": string;
  "Open batches": number;
}

export interface PackagingExportRow {
  "Product SKU": string;
  "Packaging SKU": string;
  "Packaging name": string;
  "Qty per unit": number;
  "On hand": number;
  "On order": number;
  "Need from product": number;
  "Recommended PO qty": number;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildForecastExportRows(
  recommendations: RestockRecommendation[],
): ForecastExportRow[] {
  return recommendations.map((row) => {
    const status = stockStatusOf(row);
    const doiMonths = monthsOfCover(row);
    return {
      Status: STOCK_STATUS_BADGE[status].label,
      SKU: row.sku_code,
      Franchise: row.franchise_name ?? "",
      Velocity: titleCase(row.velocity_class),
      Pattern: titleCase(row.demand_pattern),
      Stock: round(row.current_stock, 2),
      "On order": round(row.on_order_qty, 2),
      "Fcst/day": round(row.forecast_daily_demand, 4),
      "Fcst/mo": round(row.forecast_daily_demand * DAYS_PER_MONTH, 2),
      "DOI (days)":
        row.days_until_stockout === null
          ? ""
          : round(row.days_until_stockout, 1),
      "DOI (months)": doiMonths === null ? "" : round(doiMonths, 2),
      "On-hand stockout": row.projected_stockout_date ?? "",
      "Next batch in": row.earliest_incoming_batch_date ?? "",
      "Batch stockout": row.incoming_batch_stockout_date ?? "",
      "Stockout gap": row.has_stockout_gap ? "Yes" : "No",
      "Reorder point": round(row.reorder_point, 2),
      "Restock qty": round(row.recommended_restock_qty, 2),
      "Safety stock": round(row.safety_stock, 2),
      "Lead time (days)": round(row.lead_time_days, 1),
      Confidence: titleCase(row.confidence),
      "Covered by PO": row.covered_by_po ? "Yes" : "No",
      "Needs reorder": row.needs_reorder ? "Yes" : "No",
      "First sale date": row.first_sale_date ?? "",
    };
  });
}

export function buildNpdExportRows(npdSkus: NpdStockRow[]): NpdExportRow[] {
  return npdSkus.map((row) => ({
    SKU: row.sku_code,
    Name: row.sku_name ?? "",
    Franchise: row.franchise_name ?? "",
    "On hand": round(row.qty_on_hand, 2),
    "Stock as of": row.stock_as_of ?? "",
    "Incoming qty": round(row.incoming_qty, 2),
    "Next batch in": row.earliest_incoming_batch_date ?? "",
    "Open batches": row.open_batch_count,
  }));
}

export function buildPackagingExportRows(
  packagingByProduct: Record<string, ProductLinkedPackagingRow[]>,
): PackagingExportRow[] {
  const rows: PackagingExportRow[] = [];
  for (const [productSku, packagingRows] of Object.entries(packagingByProduct)) {
    for (const row of packagingRows) {
      rows.push({
        "Product SKU": productSku,
        "Packaging SKU": row.packaging_sku_code,
        "Packaging name": row.packaging_name ?? "",
        "Qty per unit": round(row.qty_per_unit, 4),
        "On hand": round(row.qty_on_hand, 2),
        "On order": round(row.on_order_qty, 2),
        "Need from product": round(row.need_from_product, 2),
        "Recommended PO qty": round(row.recommended_po_qty, 2),
      });
    }
  }
  return rows.sort((a, b) => {
    const byProduct = a["Product SKU"].localeCompare(b["Product SKU"]);
    if (byProduct !== 0) return byProduct;
    return a["Packaging SKU"].localeCompare(b["Packaging SKU"]);
  });
}

export async function downloadForecastXlsx(input: {
  recommendations: RestockRecommendation[];
  npdSkus?: NpdStockRow[];
  packagingByProduct?: Record<string, ProductLinkedPackagingRow[]>;
  filename?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const forecastRows = buildForecastExportRows(input.recommendations);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(forecastRows),
    "Forecast",
  );

  const npdRows = buildNpdExportRows(input.npdSkus ?? []);
  if (npdRows.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(npdRows),
      "NPD stock",
    );
  }

  const packagingRows = buildPackagingExportRows(
    input.packagingByProduct ?? {},
  );
  if (packagingRows.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(packagingRows),
      "Packaging",
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(
    workbook,
    input.filename ?? `inventory-forecast-${stamp}.xlsx`,
  );
}
