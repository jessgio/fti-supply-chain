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

const ZERO_DECIMAL_CURRENCIES = new Set<PoCurrency>(["IDR", "JPY", "KRW"]);

export function formatPoMoney(value: number, currency: string = DEFAULT_PO_CURRENCY): string {
  const code = (PO_CURRENCIES.some((c) => c.code === currency)
    ? currency
    : DEFAULT_PO_CURRENCY) as PoCurrency;
  const locale = code === "IDR" ? "id-ID" : "en-US";
  const decimals = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}
