import { XMLParser } from "fast-xml-parser";
import { SaxesParser, type SaxesTag } from "saxes";
import yauzl from "yauzl";
import { isIncludedWmsSalesRow } from "@/lib/excel/sales-filters";
import { parseExcelDate } from "@/lib/excel/date-parse";
import type { SalesRow } from "@/types/database";

function attr(tag: SaxesTag, name: string): string | undefined {
  const value = tag.attributes[name];
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    return String(value.value);
  }
  return undefined;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_/]+/g, "");
}

function columnToIndex(col: string): number {
  if (!col || !/^[A-Z]+$/.test(col)) return -1;
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  const zeroBased = index - 1;
  return zeroBased >= 0 && zeroBased < 256 ? zeroBased : -1;
}

function cellColumn(ref: string): string {
  return ref.replace(/[0-9]/g, "");
}

function toNumber(value: string): number {
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function openZipFromBuffer(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new Error("Failed to open zip"));
      else resolve(zipfile);
    });
  });
}

function readZipEntry(zipfile: yauzl.ZipFile, targetName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);

    zipfile.on("error", onError);
    zipfile.on("entry", (entry) => {
      if (entry.fileName === targetName) {
        zipfile.openReadStream(entry, (err, stream) => {
          if (err || !stream) {
            reject(err ?? new Error("Failed to open zip entry stream"));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => resolve(Buffer.concat(chunks)));
          stream.on("error", onError);
        });
      } else {
        zipfile.readEntry();
      }
    });

    zipfile.on("end", () => reject(new Error(`Zip entry not found: ${targetName}`)));
    zipfile.readEntry();
  });
}

function parseSharedStrings(xml: Buffer): string[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    isArray: (name) => name === "si" || name === "t",
  });
  const doc = parser.parse(xml.toString("utf8"));
  const items = doc?.sst?.si ?? [];
  const list = Array.isArray(items) ? items : [items];

  return list.map((si) => {
    if (!si) return "";
    if (typeof si.t === "string") return si.t;
    if (Array.isArray(si.t)) return si.t.join("");
    if (si.t && typeof si.t === "object" && "#text" in si.t) {
      return String(si.t["#text"] ?? "");
    }
    return "";
  });
}

function resolveCellValue(
  raw: string,
  type: string | undefined,
  sharedStrings: string[],
): string {
  if (!raw) return "";
  if (type === "s") {
    const idx = Number(raw);
    return sharedStrings[idx] ?? "";
  }
  return raw;
}

function rowToSales(
  values: string[],
  columnMap: Record<string, number>,
): SalesRow | null {
  const get = (key: string) => values[columnMap[key] ?? -1] ?? "";

  const tipe = get("tipetransaksi");
  const status = get("status");
  if (!isIncludedWmsSalesRow(tipe, status)) return null;

  const sku = get("sku").trim();
  if (!sku || sku === "-") return null;

  const tanggalRaw = get("tanggal").trim();
  const sale_date = parseExcelDate(tanggalRaw);

  const channel = get("channel").trim();
  if (!sale_date || !channel) return null;

  const qty = toNumber(get("qty"));
  const netSales = toNumber(get("nettsales"));
  const harga = toNumber(get("harga"));

  return {
    sale_date,
    channel,
    sku_code: sku,
    qty_sold: qty,
    net_sales: netSales,
    retail_price: harga > 0 ? harga : undefined,
  };
}

async function streamSheetRows(
  xml: NodeJS.ReadableStream,
  sharedStrings: string[],
  onRow: (values: string[]) => void,
): Promise<void> {
  const parser = new SaxesParser();

  let inCell = false;
  let inValue = false;
  let cellType: string | undefined;
  let cellRef = "";
  let cellValue = "";
  let currentRow = new Map<number, string>();

  const flushRow = () => {
    if (currentRow.size === 0) return;
    const values: string[] = [];
    for (const [col, value] of currentRow) {
      values[col] = value;
    }
    onRow(values);
    currentRow = new Map();
  };

  parser.on("opentag", (tag) => {
    const name = tag.name.replace(/^.*:/, "");
    if (name === "c") {
      inCell = true;
      cellType = attr(tag, "t");
      cellRef = attr(tag, "r") ?? "";
      cellValue = "";
    } else if (name === "v" && inCell) {
      inValue = true;
      cellValue = "";
    }
  });

  parser.on("text", (text) => {
    if (inValue) cellValue += text;
  });

  parser.on("closetag", (tag) => {
    const name = tag.name.replace(/^.*:/, "");
    if (name === "v" && inCell) {
      inValue = false;
    } else if (name === "c" && inCell) {
      const col = columnToIndex(cellColumn(cellRef));
      if (col >= 0) {
        const value = resolveCellValue(cellValue, cellType, sharedStrings);
        currentRow.set(col, value);
      }
      inCell = false;
    } else if (name === "row") {
      flushRow();
    }
  });

  return new Promise((resolve, reject) => {
    xml.on("data", (chunk: Buffer) => {
      parser.write(chunk.toString("utf8"));
    });
    xml.on("end", () => {
      parser.close();
      resolve();
    });
    xml.on("error", reject);
    parser.on("error", reject);
  });
}

function openSheetStream(
  zipfile: yauzl.ZipFile,
  targetName: string,
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);

    zipfile.on("error", onError);
    zipfile.on("entry", (entry) => {
      if (entry.fileName === targetName) {
        zipfile.openReadStream(entry, (err, stream) => {
          if (err || !stream) reject(err ?? new Error("Failed to open sheet stream"));
          else resolve(stream);
        });
      } else {
        zipfile.readEntry();
      }
    });
    zipfile.on("end", () => reject(new Error(`Sheet not found: ${targetName}`)));
    zipfile.readEntry();
  });
}

function getRowField(
  values: string[],
  columnMap: Record<string, number>,
  key: string,
): string {
  return values[columnMap[key] ?? -1] ?? "";
}

export async function scanFtiSalesStatusCounts(buffer: Buffer): Promise<{
  byStatus: Record<string, number>;
  fakturByStatus: Record<string, number>;
  excludedCanceled: number;
  included: number;
}> {
  const stringsZip = await openZipFromBuffer(buffer);
  let sharedStrings: string[] = [];
  try {
    const sharedStringsXml = await readZipEntry(
      stringsZip,
      "xl/sharedStrings.xml",
    );
    sharedStrings = parseSharedStrings(sharedStringsXml);
  } finally {
    stringsZip.close();
  }

  const byStatus: Record<string, number> = {};
  const fakturByStatus: Record<string, number> = {};
  let excludedCanceled = 0;
  let included = 0;

  const sheetZip = await openZipFromBuffer(buffer);
  try {
    const sheetStream = await openSheetStream(
      sheetZip,
      "xl/worksheets/sheet1.xml",
    );

    let headerMap: Record<string, number> | null = null;

    await streamSheetRows(sheetStream, sharedStrings, (values) => {
      if (!headerMap) {
        headerMap = {};
        values.forEach((header, index) => {
          const key = normalizeHeader(header);
          if (key) headerMap![key] = index;
        });
        return;
      }

      const status = getRowField(values, headerMap, "status").trim() || "(empty)";
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      const tipe = getRowField(values, headerMap, "tipetransaksi");
      if (tipe.trim().toUpperCase() === "FAKTUR") {
        fakturByStatus[status] = (fakturByStatus[status] ?? 0) + 1;
        const statusUpper = status.toUpperCase();
        if (statusUpper === "CANCELED" || statusUpper === "CANCELLED") {
          excludedCanceled += 1;
        }
        if (isIncludedWmsSalesRow(tipe, getRowField(values, headerMap, "status"))) {
          included += 1;
        }
      }
    });

    return { byStatus, fakturByStatus, excludedCanceled, included };
  } finally {
    sheetZip.close();
  }
}

/**
 * Streaming parser for large FTI WMS sales exports that SheetJS cannot load.
 */
export async function parseFtiSalesXlsxStream(
  buffer: Buffer,
): Promise<SalesRow[]> {
  const stringsZip = await openZipFromBuffer(buffer);
  let sharedStrings: string[] = [];
  try {
    const sharedStringsXml = await readZipEntry(
      stringsZip,
      "xl/sharedStrings.xml",
    );
    sharedStrings = parseSharedStrings(sharedStringsXml);
  } finally {
    stringsZip.close();
  }

  const sheetZip = await openZipFromBuffer(buffer);
  try {
    const sheetStream = await openSheetStream(
      sheetZip,
      "xl/worksheets/sheet1.xml",
    );

    let headerMap: Record<string, number> | null = null;
    const rows: SalesRow[] = [];

    await streamSheetRows(sheetStream, sharedStrings, (values) => {
      if (!headerMap) {
        headerMap = {};
        values.forEach((header, index) => {
          const key = normalizeHeader(header);
          if (key) headerMap![key] = index;
        });
        return;
      }

      if (
        headerMap.tanggal === undefined ||
        headerMap.channel === undefined ||
        headerMap.sku === undefined
      ) {
        return;
      }

      const parsed = rowToSales(values, headerMap);
      if (parsed) rows.push(parsed);
    });

    return rows;
  } finally {
    sheetZip.close();
  }
}
