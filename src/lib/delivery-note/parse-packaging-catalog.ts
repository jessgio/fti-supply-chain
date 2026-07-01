import * as XLSX from "xlsx";
import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";

export interface PackagingCatalogCsvRow {
  item_code: string;
  product_name: string;
}

export interface PackagingCatalogParseError {
  row: number;
  message: string;
}

export interface PackagingCatalogParseResult {
  rows: PackagingCatalogCsvRow[];
  errors: PackagingCatalogParseError[];
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

function pickString(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const normalized = normalizeKey(alias);
    for (const [key, value] of Object.entries(row)) {
      if (normalizeKey(key) !== normalized) continue;
      if (value == null || value === "") return "";
      if (typeof value === "number" && Number.isFinite(value)) {
        return Number.isInteger(value)
          ? String(value)
          : String(value).replace(/\.0+$/, "");
      }
      return fixUtf8Mojibake(String(value).trim());
    }
  }
  return "";
}

function sheetRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    codepage: 65001,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
}

function normalizeItemCode(code: string): string {
  return code.trim().toUpperCase();
}

export function parsePackagingCatalogFile(buffer: ArrayBuffer): PackagingCatalogParseResult {
  const rawRows = sheetRows(buffer);
  if (rawRows.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: "File is empty or has no data rows." }],
    };
  }

  const errors: PackagingCatalogParseError[] = [];
  const byCode = new Map<string, PackagingCatalogCsvRow>();

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const itemNo = pickString(row, ["Item No", "ItemNo", "item_code", "Kode Barang"]);
    const description = pickString(row, [
      "Description",
      "Product Name",
      "product_name",
      "Deskripsi",
    ]);

    if (!itemNo && !description) return;

    if (!itemNo) {
      errors.push({ row: rowNumber, message: "Missing Item No." });
      return;
    }
    if (!description) {
      errors.push({ row: rowNumber, message: "Missing Description." });
      return;
    }

    const item_code = normalizeItemCode(itemNo);
    if (item_code.length !== 12) {
      errors.push({
        row: rowNumber,
        message: `Item No "${itemNo}" must be exactly 12 characters.`,
      });
      return;
    }

    byCode.set(item_code, { item_code, product_name: description });
  });

  if (byCode.size === 0 && errors.length === 0) {
    errors.push({
      row: 1,
      message: 'No data rows found. Expected headers "Item No" and "Description".',
    });
  }

  return {
    rows: [...byCode.values()].sort((a, b) => a.item_code.localeCompare(b.item_code)),
    errors,
  };
}
