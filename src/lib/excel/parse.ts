import * as XLSX from "xlsx";
import { z } from "zod";
import { parseExcelDate } from "@/lib/excel/date-parse";
import {
  isIncludedWmsSalesRow,
  normalizeWmsSalesAmounts,
  parseWmsSalesNumber,
} from "@/lib/excel/sales-filters";
import {
  isStockImportLocation,
  STOCK_QTY_COLUMN,
} from "@/lib/stock/locations";
import type {
  BundleComponent,
  MappingRow,
  SalesRow,
  StockRow,
} from "@/types/database";

function sheetToRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

function pick<T>(row: Record<string, unknown>, aliases: string[]): T | undefined {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalized = normalizeKey(alias);
    const match = entries.find(([k]) => normalizeKey(k) === normalized);
    if (match) return match[1] as T;
  }
  return undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

const salesSchema = z.object({
  sale_date: z.string().min(1),
  channel: z.string().min(1),
  sku_code: z.string().min(1),
  qty_sold: z.number(),
  net_sales: z.number(),
  retail_price: z.number().nonnegative().optional(),
});

const stockSchema = z.object({
  sku_code: z.string().min(1),
  location: z.string().min(1),
  qty_on_hand: z.number(),
  as_of_date: z.string().min(1),
  retail_price: z.number().nonnegative().optional(),
});

const mappingSchema = z.object({
  sku_code: z.string().min(1),
  franchise_name: z.string().min(1),
  sku_name: z.string().optional(),
});

function readSalesRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((n) => {
      const key = normalizeKey(n);
      return key === "data1" || key.includes("sales") || key === "data";
    }) ?? workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "", raw: false },
  );
}

function isWmsSalesExport(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const sample = rows[0];
  return (
    pick(sample, ["tanggal"]) !== undefined &&
    pick(sample, ["sku"]) !== undefined &&
    (pick(sample, ["nettsales"]) !== undefined ||
      pick(sample, ["netsales"]) !== undefined)
  );
}

function isIncludedSalesRow(row: Record<string, unknown>): boolean {
  const tipe = String(
    pick(row, ["tipe transaksi", "tipetransaksi", "transactiontype"]) ?? "",
  );
  const status = String(pick(row, ["status"]) ?? "");
  return isIncludedWmsSalesRow(tipe, status);
}

function parseWmsSalesRows(rows: Record<string, unknown>[]): SalesRow[] {
  return rows
    .filter(isIncludedSalesRow)
    .map((row) => {
      const retailPrice = toNumber(pick(row, ["harga", "price", "rsp"]));
      const status = String(pick(row, ["status"]) ?? "");
      const amounts = normalizeWmsSalesAmounts(
        status,
        parseWmsSalesNumber(pick(row, ["qty", "quantity", "qty_sold"])),
        parseWmsSalesNumber(
          pick(row, [
            "nett sales",
            "nettsales",
            "net sales",
            "netsales",
            "net_sales",
          ]),
        ),
      );
      const parsed = salesSchema.safeParse({
        sale_date: parseExcelDate(pick(row, ["tanggal", "sale_date", "date"])),
        channel: String(
          pick(row, ["channel", "sales_channel", "platform", "marketplace"]) ??
            "",
        ).trim(),
        sku_code: String(
          pick(row, ["sku", "sku_code", "product_sku", "item_sku"]) ?? "",
        ).trim(),
        qty_sold: amounts.qty_sold,
        net_sales: amounts.net_sales,
        retail_price: retailPrice > 0 ? retailPrice : undefined,
      });
      return parsed.success ? parsed.data : null;
    })
    .filter(
      (row): row is SalesRow =>
        row !== null && row.sku_code.length > 0 && row.sku_code !== "-",
    );
}

export async function parseSalesExcel(buffer: ArrayBuffer): Promise<SalesRow[]> {
  const rows = readSalesRows(buffer);
  if (rows.length > 0) {
    if (isWmsSalesExport(rows)) {
      return parseWmsSalesRows(rows);
    }
    return parseGenericSalesRows(rows);
  }

  const { parseFtiSalesXlsxStream } = await import("./wms-sales-stream");
  return parseFtiSalesXlsxStream(Buffer.from(buffer));
}

function parseGenericSalesRows(rows: Record<string, unknown>[]): SalesRow[] {
  return rows
    .map((row) => {
      const retailPrice = toNumber(
        pick(row, ["harga", "retail_price", "rsp", "price"]),
      );
      const parsed = salesSchema.safeParse({
        sale_date: parseExcelDate(
          pick(row, ["sale_date", "date", "order_date", "tanggal"]),
        ),
        channel: String(
          pick(row, ["channel", "sales_channel", "platform", "marketplace"]) ??
            "",
        ).trim(),
        sku_code: String(
          pick(row, ["sku", "sku_code", "product_sku", "item_sku"]) ?? "",
        ).trim(),
        qty_sold: toNumber(
          pick(row, ["qty_sold", "quantity", "qty", "units_sold"]),
        ),
        net_sales: toNumber(
          pick(row, ["net_sales", "revenue", "sales", "net_revenue", "gmv"]),
        ),
        retail_price: retailPrice > 0 ? retailPrice : undefined,
      });
      return parsed.success ? parsed.data : null;
    })
    .filter(
      (row): row is SalesRow =>
        row !== null && row.sku_code.length > 0 && row.sku_code !== "-",
    );
}

function readStockRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((n) => {
      const key = normalizeKey(n);
      return key === "data1" || key.includes("stock") || key === "data";
    }) ?? workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "", raw: false },
  );
}

function isWmsStockExport(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const sample = rows[0];
  return (
    pick(sample, [STOCK_QTY_COLUMN]) !== undefined &&
    pick(sample, ["lokasi"]) !== undefined &&
    pick(sample, ["sku"]) !== undefined
  );
}

function pickTersediaQty(row: Record<string, unknown>): number | null {
  const value = pick<unknown>(row, [STOCK_QTY_COLUMN]);
  if (value === undefined) return null;
  return toNumber(value);
}

function isArchivedStockRow(row: Record<string, unknown>): boolean {
  const status = String(
    pick(row, [
      "archive/not archive",
      "archivenotarchive",
      "archive",
      "status",
    ]) ?? "",
  )
    .trim()
    .toLowerCase();
  return status === "archive";
}

function parseWmsStockRows(
  rows: Record<string, unknown>[],
  asOfDate: string,
): StockRow[] {
  const result: StockRow[] = [];
  for (const row of rows) {
    if (isArchivedStockRow(row)) continue;

    const location = String(pick(row, ["lokasi", "location"]) ?? "").trim();
    if (!isStockImportLocation(location)) continue;

    const skuCode = String(pick(row, ["sku", "sku_code"]) ?? "").trim();
    if (!skuCode || skuCode === "-") continue;

    const qtyOnHand = pickTersediaQty(row);
    if (qtyOnHand === null) continue;

    const retailPrice = toNumber(
      pick(row, ["harga jual", "hargajual", "harga", "retail_price", "rsp"]),
    );

    const parsed = stockSchema.safeParse({
      sku_code: skuCode,
      location,
      qty_on_hand: qtyOnHand,
      as_of_date: asOfDate,
      retail_price: retailPrice > 0 ? retailPrice : undefined,
    });
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

export function parseStockExcel(
  buffer: ArrayBuffer,
  snapshotDate?: string,
): StockRow[] {
  const asOfDate = snapshotDate ?? new Date().toISOString().slice(0, 10);
  const rows = readStockRows(buffer);

  if (isWmsStockExport(rows)) {
    return parseWmsStockRows(rows, asOfDate);
  }

  return rows
    .map((row) => {
      const location =
        String(
          pick(row, ["location", "warehouse", "store", "gudang", "lokasi"]) ??
            "",
        ).trim() || "default";
      const dateRaw = pick(row, [
        "as_of_date",
        "date",
        "snapshot_date",
        "stock_date",
      ]);
      const qtyOnHand = pickTersediaQty(row);
      if (qtyOnHand === null) return null;

      const parsed = stockSchema.safeParse({
        sku_code: String(
          pick(row, ["sku", "sku_code", "product_sku", "item_sku"]) ?? "",
        ).trim(),
        location,
        qty_on_hand: qtyOnHand,
        as_of_date: dateRaw ? parseExcelDate(dateRaw) : asOfDate,
      });
      return parsed.success ? parsed.data : null;
    })
    .filter(
      (row): row is StockRow =>
        row !== null &&
        row.sku_code.length > 0 &&
        row.sku_code !== "-" &&
        isStockImportLocation(row.location),
    );
}

export function parseMappingsExcel(buffer: ArrayBuffer): {
  mappings: MappingRow[];
  bundles: BundleComponent[];
} {
  const workbook = XLSX.read(buffer, { type: "array" });
  const mappingSheet =
    workbook.Sheets[
      workbook.SheetNames.find((n) =>
        normalizeKey(n).includes("franchise"),
      ) ?? workbook.SheetNames[0]
    ];
  const bundleSheet = workbook.SheetNames.find((n) =>
    normalizeKey(n).includes("bundle"),
  );

  const mappingRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    mappingSheet,
    { defval: "", raw: false },
  );

  const mappings = mappingRows
    .map((row) => {
      const parsed = mappingSchema.safeParse({
        sku_code: String(
          pick(row, ["sku", "sku_code", "product_sku"]) ?? "",
        ).trim(),
        franchise_name: String(
          pick(row, [
            "product franchise",
            "franchise",
            "franchise_name",
            "product_franchise",
          ]) ?? "",
        ).trim(),
        sku_name: String(pick(row, ["sku_name", "name", "product_name"]) ?? "")
          .trim() || undefined,
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((row): row is MappingRow => row !== null && row.sku_code.length > 0);

  const bundles: BundleComponent[] = [];
  if (bundleSheet) {
    const bundleRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[bundleSheet],
      { defval: "", raw: false },
    );
    for (const row of bundleRows) {
      const bundle_sku_code = String(
        pick(row, ["bundle_sku", "bundle_sku_code", "bundle"]) ?? "",
      ).trim();
      const component_sku_code = String(
        pick(row, ["component_sku", "component_sku_code", "sku", "sku_code"]) ??
          "",
      ).trim();
      const qty = toNumber(
        pick(row, ["qty_per_bundle", "quantity", "qty", "units"]),
      );
      if (bundle_sku_code && component_sku_code) {
        bundles.push({
          bundle_sku_code,
          component_sku_code,
          qty_per_bundle: qty > 0 ? qty : 1,
        });
      }
    }
  }

  return { mappings, bundles };
}
