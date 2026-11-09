/**
 * Parse a money amount typed by a person.
 * Empty means zero. Thousands may be written with commas (`2,000,000`)
 * or dots (`2.000.000`). A single separator with a short fraction is a decimal.
 */
export function parseMoneyInput(raw: string): number | null {
  const compact = raw.trim().replace(/\s/g, "");
  if (!compact) return 0;
  if (!/^\d[\d.,]*$/.test(compact)) return null;

  const commas = (compact.match(/,/g) ?? []).length;
  const dots = (compact.match(/\./g) ?? []).length;
  let normalized = compact;

  if (commas > 0 && dots > 0) {
    const decimalIsComma = compact.lastIndexOf(",") > compact.lastIndexOf(".");
    if (decimalIsComma) {
      if (!/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)) return null;
      normalized = compact.replace(/\./g, "").replace(",", ".");
    } else {
      if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) return null;
      normalized = compact.replace(/,/g, "");
    }
  } else if (commas > 0) {
    if (commas === 1 && /^\d+,\d{1,2}$/.test(compact)) {
      normalized = compact.replace(",", ".");
    } else if (/^\d{1,3}(,\d{3})+$/.test(compact)) {
      normalized = compact.replace(/,/g, "");
    } else {
      return null;
    }
  } else if (dots > 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
      normalized = compact.replace(/\./g, "");
    } else if (dots === 1 && /^\d+\.\d+$/.test(compact)) {
      normalized = compact;
    } else {
      return null;
    }
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Accept a JSON amount that may already be a number or a typed string like `2,000,000`. */
export function readTaxWithholding(value: unknown): number | null {
  if (value == null || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }
  return parseMoneyInput(String(value));
}

/** Show a stored amount the way it is typed: `2000000` becomes `2,000,000`. */
export function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  const negative = value < 0;
  const absolute = Math.abs(value).toString();
  const [whole, fraction] = absolute.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = fraction ? `${withCommas}.${fraction}` : withCommas;
  return negative ? `-${formatted}` : formatted;
}
