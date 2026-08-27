import { FORECAST_CSV_HEADERS } from "@/lib/sales-forecast/constants";

export interface ForecastCsvRow {
  line: number;
  year: number;
  month: number;
  skuCode: string;
  discountPct: number;
  qty: number;
}

export interface ForecastCsvParseResult {
  rows: ForecastCsvRow[];
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], name: string): number {
  return headers.findIndex((h) => h.replace(/^\uFEFF/, "").toLowerCase() === name);
}

export function parseForecastCsv(
  text: string,
  expectedYear: number,
): ForecastCsvParseResult {
  const errors: string[] = [];
  const rows: ForecastCsvRow[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines
    .map((line, idx) => ({ line: line.trim(), number: idx + 1 }))
    .filter((row) => row.line.length > 0);
  if (nonEmpty.length === 0) {
    return { rows, errors: ["The CSV file is empty."] };
  }

  const headers = splitCsvLine(nonEmpty[0].line).map((h) =>
    h.replace(/^\uFEFF/, "").trim(),
  );
  const monthIdx = headerIndex(headers, "month");
  const skuIdx = headerIndex(headers, "sku");
  const discIdx = headerIndex(headers, "disc");
  const qtyIdx = headerIndex(headers, "qty");
  const missing = FORECAST_CSV_HEADERS.filter((name) => {
    if (name === "month") return monthIdx < 0;
    if (name === "sku") return skuIdx < 0;
    if (name === "disc") return discIdx < 0;
    return qtyIdx < 0;
  });
  if (missing.length > 0) {
    return {
      rows,
      errors: [
        `CSV must include headers: ${FORECAST_CSV_HEADERS.join(", ")}. Missing: ${missing.join(", ")}.`,
      ],
    };
  }

  for (const entry of nonEmpty.slice(1)) {
    const cells = splitCsvLine(entry.line);
    const monthRaw = cells[monthIdx] ?? "";
    const skuCode = (cells[skuIdx] ?? "").trim();
    const discRaw = cells[discIdx] ?? "";
    const qtyRaw = cells[qtyIdx] ?? "";
    const match = /^(\d{4})-(\d{2})$/.exec(monthRaw);
    if (!match) {
      errors.push(`Line ${entry.number}: month must be yyyy-mm (got "${monthRaw}").`);
      continue;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      errors.push(`Line ${entry.number}: month must be 01–12.`);
      continue;
    }
    if (year !== expectedYear) {
      errors.push(
        `Line ${entry.number}: month ${monthRaw} is not in ${expectedYear}.`,
      );
      continue;
    }
    if (!skuCode) {
      errors.push(`Line ${entry.number}: SKU is required.`);
      continue;
    }
    const discountPct = Number(String(discRaw).replace(",", "."));
    if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
      errors.push(`Line ${entry.number}: disc must be a number between 0 and 100.`);
      continue;
    }
    const qty = Number(String(qtyRaw).replace(",", "."));
    if (!Number.isFinite(qty)) {
      errors.push(`Line ${entry.number}: qty must be a number.`);
      continue;
    }
    rows.push({
      line: entry.number,
      year,
      month,
      skuCode,
      discountPct,
      qty,
    });
  }

  return { rows, errors };
}
