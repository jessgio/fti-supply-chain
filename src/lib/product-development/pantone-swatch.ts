import convert from "color-convert";
import type { ColorBook } from "color-books";

const SOLID_COATED_BOOK = "PANTONE+ Solid Coated-V3" as const;
const SOLID_UNCOATED_BOOK = "PANTONE+ Solid Uncoated-V3" as const;

const bookCache = new Map<string, ColorBook.Book>();

function loadColorBook(name: string): ColorBook.Book {
  // color-books uses fs + __dirname; must not be bundled (see next.config serverExternalPackages).
  // Lazy require so API routes that never generate swatches do not load the JSON books.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { load } = require("color-books") as typeof import("color-books");
  return load(name as ColorBook.BookNames);
}

function getBook(name: typeof SOLID_COATED_BOOK | typeof SOLID_UNCOATED_BOOK) {
  let book = bookCache.get(name);
  if (!book) {
    book = loadColorBook(name);
    bookCache.set(name, book);
  }
  return book;
}

export interface PantoneLookupResult {
  hex: string;
  bookName: string;
  recordName: string;
}

/** Build lookup keys for color-books from user-entered Pantone text. */
export function pantoneLookupKeys(raw: string): {
  keys: string[];
  book: typeof SOLID_COATED_BOOK | typeof SOLID_UNCOATED_BOOK;
} {
  let code = raw.trim().replace(/\s+/g, " ");
  if (!code) return { keys: [], book: SOLID_COATED_BOOK };

  code = code.replace(/^pantone\s+/i, "");

  const pgMatch = code.match(/^PG-?(\d+)\s*C?$/i);
  if (pgMatch) {
    code = `${pgMatch[1]} C`;
  }

  const isUncoated = /\s+U$/i.test(code);
  const book = isUncoated ? SOLID_UNCOATED_BOOK : SOLID_COATED_BOOK;

  if (/^\d+$/.test(code)) {
    code = `${code} ${isUncoated ? "U" : "C"}`;
  } else if (/^\d+\s*C$/i.test(code)) {
    code = code.replace(/\s*C$/i, " C");
  } else if (/^\d+\s*U$/i.test(code)) {
    code = code.replace(/\s*U$/i, " U");
  } else if (/^\d+[A-Z]$/i.test(code) && !/\s/.test(code)) {
    code = `${code.slice(0, -1)} ${code.slice(-1).toUpperCase()}`;
  }

  const upper = code.toUpperCase();
  const keys = [`PANTONE ${upper}`, `PANTONE ${upper.replace(/\s+/g, "")}`];
  return { keys: [...new Set(keys)], book };
}

export function lookupPantoneColor(raw: string): PantoneLookupResult | null {
  const { keys, book: primaryBook } = pantoneLookupKeys(raw);
  if (keys.length === 0) return null;

  const books: Array<typeof SOLID_COATED_BOOK | typeof SOLID_UNCOATED_BOOK> = [
    primaryBook,
    primaryBook === SOLID_COATED_BOOK ? SOLID_UNCOATED_BOOK : SOLID_COATED_BOOK,
  ];

  for (const bookName of books) {
    const book = getBook(bookName);
    for (const key of keys) {
      const record = book.records[key];
      if (!record?.components || record.components.length < 3) continue;
      const [L, a, b] = record.components as [number, number, number];
      const hex = `#${convert.lab.hex([L, a, b])}`;
      return { hex, bookName, recordName: record.name ?? key };
    }
  }

  return null;
}

export function renderPantoneSwatchSvg(
  hex: string,
  pantoneCode: string,
  colorName?: string,
): string {
  const safeHex = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#CCCCCC";
  const label = escapeXml(pantoneCode.trim() || "Pantone");
  const subtitle = colorName?.trim() ? escapeXml(colorName.trim()) : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="${safeHex}" />
  <rect x="0" y="320" width="400" height="80" fill="rgba(255,255,255,0.92)" />
  ${
    subtitle
      ? `<text x="200" y="348" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#444">${subtitle}</text>`
      : ""
  }
  <text x="200" y="${subtitle ? 372 : 360}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="#222">PANTONE ${label}</text>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPantoneSwatchFromCode(
  pantoneCode: string,
  colorName?: string,
): { hex: string; svg: string } {
  const result = lookupPantoneColor(pantoneCode);
  if (!result) {
    throw new Error(
      `Could not find Pantone "${pantoneCode}". Try formats like "1955 C" or "PANTONE 2342 C".`,
    );
  }
  return {
    hex: result.hex,
    svg: renderPantoneSwatchSvg(result.hex, pantoneCode, colorName),
  };
}
