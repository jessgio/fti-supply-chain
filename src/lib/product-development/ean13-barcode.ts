import bwipjs from "bwip-js";

/** Normalize user input to a valid 13-digit EAN-13 code. */
export function normalizeEan13(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 13) {
    return validateEan13CheckDigit(digits) ? digits : null;
  }
  if (digits.length === 12) {
    return digits + computeEan13CheckDigit(digits);
  }
  return null;
}

function computeEan13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(first12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return String(check);
}

function validateEan13CheckDigit(code: string): boolean {
  if (code.length !== 13) return false;
  return code[12] === computeEan13CheckDigit(code.slice(0, 12));
}

/** Render an EAN-13 barcode PNG at 300 DPI. */
export async function renderEan13Png(ean13: string): Promise<Buffer> {
  const normalized = normalizeEan13(ean13);
  if (!normalized) {
    throw new Error("GS1 must be a valid 12- or 13-digit EAN-13 code.");
  }

  return bwipjs.toBuffer({
    bcid: "ean13",
    text: normalized,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
    dpi: 300,
  });
}
