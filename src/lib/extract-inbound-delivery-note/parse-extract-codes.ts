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

const ITEM_CODE_ALIASES = [
  "Item No",
  "ItemNo",
  "item_code",
  "Item Code",
  "Kode Barang",
  "Extract Code",
  "Code",
];

const EXTRACT_NAME_ALIASES = [
  "Extract Name",
  "extract_name",
  "Description",
  "Deskripsi",
  "Name",
  "Nama",
  "Nama Extract",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

function readCellValue(
  sheet: XLSX.WorkSheet,
  cellRef: string,
  raw: unknown,
): unknown {
  const cell = sheet[cellRef];
  if (!cell) return raw ?? "";

  // Prefer raw numeric values over Excel display text, which may use scientific notation.
  if (cell.t === "n" && typeof cell.v === "number") {
    return cell.v;
  }

  if (cell.w) return cell.w;
  if (cell.v != null && cell.v !== "") return cell.v;
  return raw ?? "";
}

function formatCellValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(value);
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 1e-9) return String(rounded);
    return String(value).replace(/\.0+$/, "");
  }
  return fixUtf8Mojibake(String(value).trim());
}

function pickString(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const normalized = normalizeKey(alias);
    for (const [key, value] of Object.entries(row)) {
      if (normalizeKey(key) !== normalized) continue;
      const formatted = formatCellValue(value);
      if (!formatted) continue;
      return formatted;
    }
  }
  return "";
}

function findHeaderRowIndex(rows: unknown[][]): number {
  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row?.length) continue;

    const headers = row.map((cell) => normalizeKey(String(cell ?? "")));
    let score = 0;
    for (const alias of ITEM_CODE_ALIASES) {
      if (headers.includes(normalizeKey(alias))) score += 2;
    }
    for (const alias of EXTRACT_NAME_ALIASES) {
      if (headers.includes(normalizeKey(alias))) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore >= 2 ? bestIndex : 0;
}

function sheetRows(buffer: ArrayBuffer): Array<{ excelRow: number; cells: Record<string, unknown> }> {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    codepage: 65001,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  if (matrix.length === 0) return [];

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headers = (matrix[headerRowIndex] ?? []).map((cell) => String(cell ?? "").trim());

  const rows: Array<{ excelRow: number; cells: Record<string, unknown> }> = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex++) {
    const line = matrix[rowIndex] ?? [];
    if (line.every((cell) => cell == null || cell === "")) continue;

    const cells: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      if (!header) return;
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      cells[header] = readCellValue(sheet, cellRef, line[columnIndex]);
    });
    rows.push({ excelRow: rowIndex + 1, cells });
  }

  return rows;
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
  const byPair = new Map<string, ExtractCodeCsvRow>();

  rawRows.forEach(({ excelRow, cells }) => {
    const itemNo = pickString(cells, ITEM_CODE_ALIASES);
    const name = pickString(cells, EXTRACT_NAME_ALIASES);

    if (!itemNo && !name) return;

    if (!itemNo) {
      errors.push({ row: excelRow, message: "Missing item code." });
      return;
    }
    if (!name) {
      errors.push({ row: excelRow, message: "Missing extract name." });
      return;
    }

    const item_code = normalizeItemCode(itemNo);
    if (!item_code) {
      errors.push({ row: excelRow, message: "Item code is empty." });
      return;
    }

    if (byPair.has(`${item_code}\0${name}`)) {
      errors.push({
        row: excelRow,
        message: `Duplicate row for item code "${item_code}" and extract name "${name}" in file; keeping the last occurrence.`,
      });
    }

    byPair.set(`${item_code}\0${name}`, { item_code, extract_name: name });
  });

  if (byPair.size === 0 && errors.length === 0) {
    errors.push({
      row: 1,
      message:
        'No data rows found. Expected headers like "Item No" and "Extract Name".',
    });
  }

  return {
    rows: [...byPair.values()].sort(
      (a, b) =>
        a.extract_name.localeCompare(b.extract_name) ||
        a.item_code.localeCompare(b.item_code),
    ),
    errors,
  };
}
