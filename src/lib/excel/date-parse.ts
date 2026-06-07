/** WMS exports often use DD/MM/YYYY with an optional time suffix. */
const DD_MM_YYYY_TIME =
  /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;

export function excelSerialToDateString(serial: number): string {
  const utcDays = Math.floor(serial);
  const ms = Date.UTC(1899, 11, 30) + utcDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function formatValidatedDate(year: number, month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Normalize Excel / WMS date values to YYYY-MM-DD for Postgres. */
export function parseExcelDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && value > 20_000) {
    return excelSerialToDateString(value);
  }

  const text = String(value ?? "").trim();
  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const isoDatePrefix = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoDatePrefix) return isoDatePrefix[1]!;

  const ddMmMatch = text.match(DD_MM_YYYY_TIME);
  if (ddMmMatch) {
    const day = Number(ddMmMatch[1]);
    const month = Number(ddMmMatch[2]);
    const year = Number(ddMmMatch[3]);
    const formatted = formatValidatedDate(year, month, day);
    if (formatted) return formatted;
  }

  const asNum = Number(text.replace(/,/g, ""));
  if (
    !text.includes("/") &&
    !text.includes("-") &&
    Number.isFinite(asNum) &&
    asNum > 20_000
  ) {
    return excelSerialToDateString(asNum);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}
