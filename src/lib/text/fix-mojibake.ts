/**
 * Repair common UTF-8 mojibake (smart quotes, dashes, nbsp) when UTF-8 bytes
 * were interpreted as Latin-1 / Windows-1252 and re-saved as UTF-8.
 */
const DASH_MOJIBAKE = /\u00e2\u0080[\u0090-\u009f]/g;

const DASH_BY_BYTE: Record<number, string> = {
  0x90: "\u201a", // single low-9 quotation mark
  0x91: "\u2018", // left single quote
  0x92: "\u2019", // right single quote
  0x93: "\u2013", // en dash
  0x94: "\u2014", // em dash
  0x95: "\u2022", // bullet
  0x96: "\u2013", // en dash (alternate)
  0x97: "\u2014", // em dash (alternate)
  0x98: "\u02dc", // small tilde
  0x99: "\u2122", // trademark
  0x9a: "\u0161", // s with caron
  0x9b: "\u203a", // single right angle quote
  0x9c: "\u201c", // left double quote
  0x9d: "\u201d", // right double quote
  0x9e: "\u017e", // z with caron
  0x9f: "\u0178", // y with diaeresis
};

export function fixUtf8Mojibake(text: string): string {
  if (!text) return text;

  let result = text.replace(DASH_MOJIBAKE, (match) => {
    const byte = match.charCodeAt(2);
    return DASH_BY_BYTE[byte] ?? match;
  });

  // Non-breaking space: UTF-8 C2 A0 misread as Â + NBSP
  result = result.replace(/\u00c2\u00a0/g, " ");
  // Other C2 xx Latin-1 misreads for UTF-8 second byte (less common)
  result = result.replace(/\u00c2([\u0080-\u00bf])/g, (_, c: string) =>
    String.fromCharCode(c.charCodeAt(0)),
  );
  // Stray Â before ASCII punctuation/spaces
  result = result.replace(/\u00c2(?=[ \t#])/g, "");

  return result;
}
