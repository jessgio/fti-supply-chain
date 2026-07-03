export const PO_CURRENCIES = [
  { code: "IDR", label: "IDR — Indonesian Rupiah" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "KRW", label: "KRW — South Korean Won" },
] as const;

export type PoCurrency = (typeof PO_CURRENCIES)[number]["code"];

export const DEFAULT_PO_CURRENCY: PoCurrency = "IDR";

const VALID_PO_CURRENCY = new Set<string>(PO_CURRENCIES.map((c) => c.code));

export function isValidPoCurrency(currency: string): currency is PoCurrency {
  return VALID_PO_CURRENCY.has(currency);
}

/** Max decimal places for PO line unit costs and derived totals. */
export const PO_UNIT_COST_DECIMALS = 5;

/** `step` attribute for unit-cost number inputs. */
export const PO_UNIT_COST_STEP = "0.00001";

export function formatPoMoney(value: number, currency: string = DEFAULT_PO_CURRENCY): string {
  const code = (PO_CURRENCIES.some((c) => c.code === currency)
    ? currency
    : DEFAULT_PO_CURRENCY) as PoCurrency;
  const locale = code === "IDR" ? "id-ID" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: PO_UNIT_COST_DECIMALS,
    minimumFractionDigits: 0,
  }).format(value);
}
