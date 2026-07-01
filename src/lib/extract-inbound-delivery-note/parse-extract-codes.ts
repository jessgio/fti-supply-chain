import * as XLSX from "xlsx";
import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";

export interface ExtractCodeCsvRow {
  item_code: string;
  extract_name: string;
}

export interface ExtractCodeParseError {
  row: number;
  message: string;
}

export interface ExtractCodeParseResult {
  rows: ExtractCodeCsvRow[];
  errors: ExtractCodeParseError[];
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
  return code.trim();
}

export function parseExtractCodesFile(buffer: ArrayBuffer): ExtractCodeParseResult {
  const rawRows = sheetRows(buffer);
  if (rawRows.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: "File is empty or has no data rows." }],
    };
  }

  const errors: ExtractCodeParseError[] = [];
  const byCode = new Map<string, ExtractCodeCsvRow>();

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const itemNo = pickString(row, [
      "Item No",
      "ItemNo",
      "item_code",
      "Kode Barang",
      "Extract Code",
      "Code",
    ]);
    const name = pickString(row, [
      "Extract Name",
      "extract_name",
      "Description",
      "Deskripsi",
      "Name",
    ]);

    if (!itemNo && !name) return;

    if (!itemNo) {
      errors.push({ row: rowNumber, message: "Missing item code." });
      return;
    }
    if (!name) {
      errors.push({ row: rowNumber, message: "Missing extract name." });
      return;
    }

    const item_code = normalizeItemCode(itemNo);
    if (!item_code) {
      errors.push({ row: rowNumber, message: "Item code is empty." });
      return;
    }

    byCode.set(item_code, { item_code, extract_name: name });
  });

  if (byCode.size === 0 && errors.length === 0) {
    errors.push({
      row: 1,
      message:
        'No data rows found. Expected headers like "Item No" and "Extract Name".',
    });
  }

  return {
    rows: [...byCode.values()].sort((a, b) => a.item_code.localeCompare(b.item_code)),
    errors,
  };
}
