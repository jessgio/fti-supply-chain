import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  categorize,
  DEFAULT_CATEGORY_RULES,
} from "@/lib/extracts/categories";
import { resolveActionCodeCategory } from "@/lib/extracts/mappings";
import { computeLedgerStats, orderTransactions } from "@/lib/extracts/ledger";
import { transactionSignature } from "@/lib/extracts/signature";
import { normalizeExtractDate } from "@/lib/extracts/parse";
import { loadActionCodeMappings } from "@/lib/db/extract-mappings";
import type {
  ExtractCategory,
  ExtractCategoryRule,
  ExtractDetail,
  ExtractSortKey,
  ExtractSummary,
  ExtractTransaction,
  ExtractTxnSortKey,
  ParsedExtract,
} from "@/types/database";

type SortDir = "asc" | "desc";

interface TxnRow {
  id: string;
  extract_id: string;
  txn_date: string;
  seq: number;
  order_no: string | null;
  tran_code: string | null;
  from_to: string | null;
  category: ExtractCategory;
  lot_no: string | null;
  entered_qty: string | number | null;
  received: string | number;
  issued: string | number;
  balance: string | number | null;
  status: string | null;
  remark: string | null;
  source_filename: string | null;
}

function toNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullNum(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapTxn(row: TxnRow): ExtractTransaction {
  return {
    id: row.id,
    extract_id: row.extract_id,
    txn_date: row.txn_date,
    seq: row.seq,
    order_no: row.order_no,
    tran_code: row.tran_code,
    from_to: row.from_to,
    category: row.category,
    lot_no: row.lot_no,
    entered_qty: toNullNum(row.entered_qty),
    received: toNum(row.received),
    issued: toNum(row.issued),
    balance: toNullNum(row.balance),
    status: row.status,
    remark: row.remark,
    source_filename: row.source_filename,
  };
}

export async function loadCategoryRules(
  supabase: SupabaseClient,
): Promise<Omit<ExtractCategoryRule, "id">[]> {
  const { data, error } = await supabase
    .from("extract_category_rules")
    .select("pattern, category, priority")
    .order("priority", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return DEFAULT_CATEGORY_RULES;
  return data as Omit<ExtractCategoryRule, "id">[];
}

export interface ListExtractsParams {
  search?: string;
  sort?: ExtractSortKey;
  sortDir?: SortDir;
}

export async function listExtracts(
  supabase: SupabaseClient,
  params: ListExtractsParams = {},
): Promise<ExtractSummary[]> {
  const { data: extracts, error } = await supabase
    .from("extracts")
    .select("id, item_no, description, unit");
  if (error) throw error;

  const txns = await fetchAllRows<TxnRow>(() =>
    supabase
      .from("extract_transactions")
      .select(
        "id, extract_id, txn_date, seq, received, issued, balance, category",
      ),
  );

  const byExtract = new Map<string, ExtractTransaction[]>();
  for (const row of txns) {
    const list = byExtract.get(row.extract_id) ?? [];
    list.push(mapTxn(row));
    byExtract.set(row.extract_id, list);
  }

  let summaries: ExtractSummary[] = (extracts ?? []).map((ex) => {
    const rows = byExtract.get(ex.id) ?? [];
    const stats = computeLedgerStats(rows);
    return {
      id: ex.id,
      item_no: ex.item_no,
      description: ex.description,
      unit: ex.unit,
      txn_count: stats.txn_count,
      first_date: stats.first_date,
      last_date: stats.last_date,
      starting_balance: stats.starting_balance,
      ending_balance: stats.ending_balance,
      total_received: stats.total_received,
      total_issued: stats.total_issued,
      waste_issued: stats.waste_issued,
      waste_pct: stats.waste_pct,
    } satisfies ExtractSummary;
  });

  const q = params.search?.trim().toLowerCase();
  if (q) {
    summaries = summaries.filter(
      (s) =>
        s.item_no.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false),
    );
  }

  const sort = params.sort ?? "item_no";
  const dir = params.sortDir ?? "asc";
  const sign = dir === "asc" ? 1 : -1;
  summaries.sort((a, b) => compareSummaries(a, b, sort) * sign);

  return summaries;
}

function compareSummaries(
  a: ExtractSummary,
  b: ExtractSummary,
  key: ExtractSortKey,
): number {
  switch (key) {
    case "item_no":
      return a.item_no.localeCompare(b.item_no);
    case "description":
      return (a.description ?? "").localeCompare(b.description ?? "");
    case "ending_balance":
      return a.ending_balance - b.ending_balance;
    case "total_received":
      return a.total_received - b.total_received;
    case "total_issued":
      return a.total_issued - b.total_issued;
    case "waste_pct":
      return (a.waste_pct ?? -1) - (b.waste_pct ?? -1);
    case "txn_count":
      return a.txn_count - b.txn_count;
    case "last_date":
      return (a.last_date ?? "").localeCompare(b.last_date ?? "");
    default:
      return 0;
  }
}

export interface ExtractDetailParams {
  from?: string;
  to?: string;
  category?: ExtractCategory;
  search?: string;
  sort?: ExtractTxnSortKey;
  sortDir?: SortDir;
}

export async function getExtractDetail(
  supabase: SupabaseClient,
  extractId: string,
  params: ExtractDetailParams = {},
): Promise<ExtractDetail | null> {
  const { data: extract, error } = await supabase
    .from("extracts")
    .select("id, item_no, description, unit")
    .eq("id", extractId)
    .maybeSingle();
  if (error) throw error;
  if (!extract) return null;

  const rows = await fetchAllRows<TxnRow>(() =>
    supabase
      .from("extract_transactions")
      .select(
        "id, extract_id, txn_date, seq, order_no, tran_code, from_to, category, lot_no, entered_qty, received, issued, balance, status, remark, source_filename",
      )
      .eq("extract_id", extractId),
  );

  const fullLedger = rows.map(mapTxn);
  const stats = computeLedgerStats(fullLedger, {
    from: params.from,
    to: params.to,
  });

  // Display rows: apply the same date window, plus category + free-text search.
  const q = params.search?.trim().toLowerCase();
  let display = orderTransactions(fullLedger).filter((t) => {
    if (params.from && t.txn_date < params.from) return false;
    if (params.to && t.txn_date > params.to) return false;
    if (params.category && t.category !== params.category) return false;
    if (q) {
      const hay = [t.order_no, t.tran_code, t.from_to, t.lot_no, t.remark]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sort = params.sort ?? "txn_date";
  const dir = params.sortDir ?? "asc";
  display = sortTransactions(display, sort, dir);

  return {
    id: extract.id,
    item_no: extract.item_no,
    description: extract.description,
    unit: extract.unit,
    txn_count: stats.txn_count,
    first_date: stats.first_date,
    last_date: stats.last_date,
    starting_balance: stats.starting_balance,
    ending_balance: stats.ending_balance,
    total_received: stats.total_received,
    total_issued: stats.total_issued,
    waste_issued: stats.waste_issued,
    waste_pct: stats.waste_pct,
    category_totals: stats.category_totals,
    transactions: display,
  };
}

function sortTransactions(
  txns: ExtractTransaction[],
  key: ExtractTxnSortKey,
  dir: SortDir,
): ExtractTransaction[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...txns].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "txn_date":
        cmp = a.txn_date.localeCompare(b.txn_date) || a.seq - b.seq;
        break;
      case "order_no":
        cmp = (a.order_no ?? "").localeCompare(b.order_no ?? "");
        break;
      case "from_to":
        cmp = (a.from_to ?? "").localeCompare(b.from_to ?? "");
        break;
      case "category":
        cmp = a.category.localeCompare(b.category);
        break;
      case "received":
        cmp = a.received - b.received;
        break;
      case "issued":
        cmp = a.issued - b.issued;
        break;
      case "balance":
        cmp = (a.balance ?? 0) - (b.balance ?? 0);
        break;
    }
    return cmp * sign;
  });
}

export interface CommitResult {
  extractId: string;
  item_no: string;
  inserted: number;
  overwritten: number;
  total: number;
  skipped: number;
}

/**
 * Upsert an extract and its parsed rows. Rows with the same signature as an
 * existing row overwrite it (handles overlapping monthly screenshots). Rows with
 * an unparseable date are skipped.
 */
export async function commitExtract(
  supabase: SupabaseClient,
  parsed: ParsedExtract,
): Promise<CommitResult> {
  const itemNo = parsed.item_no.trim();
  if (!itemNo) throw new Error("Missing extract Item No");

  const rules = await loadCategoryRules(supabase);
  const actionMappings = await loadActionCodeMappings(supabase);

  function resolveCategory(row: ParsedExtract["rows"][number]): ExtractCategory {
    if (row.category) return row.category;
    const fromCode = resolveActionCodeCategory(row.tran_code, actionMappings);
    if (fromCode !== "uncategorized") return fromCode;
    return categorize(row.from_to, rules);
  }

  const { data: extract, error: upsertError } = await supabase
    .from("extracts")
    .upsert(
      {
        item_no: itemNo,
        description: parsed.description?.trim() || null,
        unit: parsed.unit?.trim() || "kg",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_no" },
    )
    .select("id")
    .single();
  if (upsertError) throw upsertError;
  const extractId = extract.id as string;

  const seen = new Set<string>();
  let skipped = 0;
  const inserts = parsed.rows
    .map((row, index) => {
      const date = normalizeExtractDate(row.txn_date);
      if (!date) {
        skipped++;
        return null;
      }
      const received = Number(row.received) || 0;
      const issued = Number(row.issued) || 0;
      const balance =
        row.balance === null || row.balance === undefined
          ? null
          : Number(row.balance);
      const signature = transactionSignature({
        txn_date: date,
        order_no: row.order_no,
        from_to: row.from_to,
        lot_no: row.lot_no,
        received,
        issued,
        balance,
      });
      // De-duplicate identical rows within the same screenshot upload.
      if (seen.has(signature)) {
        skipped++;
        return null;
      }
      seen.add(signature);
      return {
        extract_id: extractId,
        txn_date: date,
        seq: index,
        order_no: row.order_no?.trim() || null,
        tran_code: row.tran_code?.trim() || null,
        from_to: row.from_to?.trim() || row.tran_code?.trim() || null,
        category: resolveCategory(row),
        lot_no: row.lot_no?.trim() || null,
        entered_qty:
          row.entered_qty === null || row.entered_qty === undefined
            ? null
            : Number(row.entered_qty),
        received,
        issued,
        balance,
        status: row.status?.trim() || null,
        remark: row.remark?.trim() || null,
        signature,
        source_filename: parsed.source_filename,
        source_path: parsed.source_path,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let overwritten = 0;
  if (inserts.length > 0) {
    const signatures = inserts.map((r) => r.signature);
    const existing = new Set<string>();
    const CHUNK = 200;
    for (let i = 0; i < signatures.length; i += CHUNK) {
      const { data, error } = await supabase
        .from("extract_transactions")
        .select("signature")
        .eq("extract_id", extractId)
        .in("signature", signatures.slice(i, i + CHUNK));
      if (error) throw error;
      for (const r of data ?? []) existing.add(r.signature as string);
    }
    overwritten = inserts.filter((r) => existing.has(r.signature)).length;

    const WRITE = 500;
    for (let i = 0; i < inserts.length; i += WRITE) {
      const { error } = await supabase
        .from("extract_transactions")
        .upsert(inserts.slice(i, i + WRITE), {
          onConflict: "extract_id,signature",
        });
      if (error) throw error;
    }
  }

  return {
    extractId,
    item_no: itemNo,
    total: inserts.length,
    inserted: inserts.length - overwritten,
    overwritten,
    skipped,
  };
}
