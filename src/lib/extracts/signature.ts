import { createHash } from "crypto";

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  // Fixed precision so float noise (0.1 vs 0.10000000001) hashes identically.
  return Number(value).toFixed(5);
}

function str(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Deterministic per-row fingerprint used to dedupe overlapping monthly uploads.
 * Two screenshots that contain the same ledger row produce the same signature,
 * so an upsert overwrites rather than duplicates.
 */
export function transactionSignature(input: {
  txn_date: string;
  order_no: string | null;
  from_to: string | null;
  lot_no: string | null;
  received: number;
  issued: number;
  balance: number | null;
}): string {
  const parts = [
    str(input.txn_date),
    str(input.order_no),
    str(input.from_to),
    str(input.lot_no),
    num(input.received),
    num(input.issued),
    num(input.balance),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
