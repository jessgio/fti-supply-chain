import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

// ─── date helpers ─────────────────────────────────────────────────────────────

/** Parse an ISO date string (YYYY-MM-DD or ISO timestamp) to a local Date. Returns null on invalid input. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole calendar days between two dates (always >= 0). */
export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Format an ISO date string as "12 Jun 2026".
 * Returns "—" for null/undefined/invalid.
 */
export function formatDate(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format an ISO date string as "12/06/26" (compact, for table cells).
 * Returns "—" for null/undefined/invalid.
 */
export function formatDateShort(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

// ─── number / currency helpers ────────────────────────────────────────────────

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const numberFormatters = new Map<number, Intl.NumberFormat>();

function currencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      formatter = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      });
    }
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

function numberFormatter(decimals: number): Intl.NumberFormat {
  let formatter = numberFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: decimals,
    });
    numberFormatters.set(decimals, formatter);
  }
  return formatter;
}

/** Format IDR (default) or any currency. Falls back to IDR if currency is unknown. */
export function formatCurrency(value: number, currency = "IDR"): string {
  return currencyFormatter(currency).format(value);
}

export function formatNumber(value: number, decimals = 0): string {
  return numberFormatter(decimals).format(value);
}

export function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
