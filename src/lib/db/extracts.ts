import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  categorize,
  DEFAULT_CATEGORY_RULES,
} from "@/lib/extracts/categories";
import { resolveActionCodeCategory } from "@/lib/extracts/mappings";
import {
  computeLedgerStats,
  deriveOpeningBalance,
  mergeLedgerByDate,
  orderTransactions,
  recomputeLedgerChain,
} from "@/lib/extracts/ledger";
import { transactionSignature } from "@/lib/extracts/signature";
import { normalizeExtractDate } from "@/lib/extracts/parse";
import {
  loadActionCodeMappings,
  loadManufacturerNamesByExtractId,
} from "@/lib/db/extract-mappings";
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

async function loadExtractTransactions(
  supabase: SupabaseClient,
  extractId: string,
): Promise<ExtractTransaction[]> {
  const rows = await fetchAllRows<TxnRow>(() =>
    supabase
      .from("extract_transactions")
      .select(
        "id, extract_id, txn_date, seq, order_no, tran_code, from_to, category, lot_no, entered_qty, received, issued, balance, status, remark, source_filename",
      )
      .eq("extract_id", extractId),
  );
  return orderTransactions(rows.map(mapTxn));
}

type LedgerPersistRow = {
  id?: string;
  extract_id: string;
  txn_date: string;
  seq: number;
  order_no: string | null;
  tran_code: string | null;
  from_to: string | null;
  category: ExtractCategory;
  lot_no: string | null;
  entered_qty: number | null;
  received: number;
  issued: number;
  balance: number;
  status: string | null;
  remark: string | null;
  signature: string;
  source_filename: string | null;
  source_path?: string | null;
};

async function persistLedgerRows(
  supabase: SupabaseClient,
  rows: LedgerPersistRow[],
): Promise<void> {
  const now = new Date().toISOString();
  const inserts = rows.filter((row) => !row.id);
  const updates = rows.filter((row) => row.id);

  for (const row of updates) {
    const { error } = await supabase
      .from("extract_transactions")
      .update({
        txn_date: row.txn_date,
        seq: row.seq,
        order_no: row.order_no,
        tran_code: row.tran_code,
        from_to: row.from_to,
        category: row.category,
        lot_no: row.lot_no,
        entered_qty: row.entered_qty,
        received: row.received,
        issued: row.issued,
        balance: row.balance,
        status: row.status,
        remark: row.remark,
        signature: row.signature,
        source_filename: row.source_filename,
        source_path: row.source_path ?? null,
        updated_at: now,
      })
      .eq("id", row.id as string);
    if (error) throw error;
  }

  if (inserts.length > 0) {
    const WRITE = 500;
    for (let i = 0; i < inserts.length; i += WRITE) {
      const chunk = inserts.slice(i, i + WRITE).map((row) => ({
        extract_id: row.extract_id,
        txn_date: row.txn_date,
        seq: row.seq,
        order_no: row.order_no,
        tran_code: row.tran_code,
        from_to: row.from_to,
        category: row.category,
        lot_no: row.lot_no,
        entered_qty: row.entered_qty,
        received: row.received,
        issued: row.issued,
        balance: row.balance,
        status: row.status,
        remark: row.remark,
        signature: row.signature,
        source_filename: row.source_filename,
        source_path: row.source_path ?? null,
        updated_at: now,
      }));
      const { error } = await supabase.from("extract_transactions").insert(chunk);
      if (error) throw error;
    }
  }
}

function toLedgerPersistRow(
  row: ExtractTransaction & { signature: string },
  extractId: string,
  sourceFilename: string | null,
  sourcePath?: string | null,
): LedgerPersistRow {
  return {
    id: row.id,
    extract_id: extractId,
    txn_date: row.txn_date,
    seq: row.seq,
    order_no: row.order_no,
    tran_code: row.tran_code,
    from_to: row.from_to,
    category: row.category,
    lot_no: row.lot_no,
    entered_qty: row.entered_qty,
    received: row.received,
    issued: row.issued,
    balance: row.balance ?? 0,
    status: row.status,
    remark: row.remark,
    signature: row.signature,
    source_filename: row.source_filename ?? sourceFilename,
    source_path: sourcePath ?? null,
  };
}

async function recomputeAndPersistLedger(
  supabase: SupabaseClient,
  extractId: string,
  rows: ExtractTransaction[],
  openingBalance: number,
  sourceFilename: string | null,
  sourcePath?: string | null,
): Promise<number> {
  const ordered = orderTransactions(rows);
  const recomputed = recomputeLedgerChain(ordered, openingBalance);
  const persistRows = recomputed.map((row) =>
    toLedgerPersistRow(row, extractId, sourceFilename, sourcePath),
  );
  await persistLedgerRows(supabase, persistRows);
  return persistRows.filter((row) => row.id).length;
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
  const [{ data: extracts, error }, manufacturerNames, statsRes] =
    await Promise.all([
      supabase.from("extracts").select("id, item_no, description, unit"),
      loadManufacturerNamesByExtractId(supabase),
      supabase.rpc("get_extract_summaries"),
    ]);
  if (error) throw error;
  if (statsRes.error) throw statsRes.error;

  type StatsRow = {
    extract_id: string;
    txn_count: number;
    first_date: string | null;
    last_date: string | null;
    starting_balance: number;
    ending_balance: number;
    total_received: number;
    total_issued: number;
    waste_issued: number;
  };

  const statsByExtract = new Map<string, StatsRow>();
  for (const row of (statsRes.data ?? []) as StatsRow[]) {
    statsByExtract.set(row.extract_id, row);
  }

  let summaries: ExtractSummary[] = (extracts ?? []).map((ex) => {
    const stats = statsByExtract.get(ex.id);
    const starting = Number(stats?.starting_balance ?? 0);
    const totalReceived = Number(stats?.total_received ?? 0);
    const wasteIssued = Number(stats?.waste_issued ?? 0);
    const denom = starting + totalReceived;
    const wastePct = denom > 0 ? (wasteIssued / denom) * 100 : null;

    return {
      id: ex.id,
      item_no: ex.item_no,
      description: ex.description,
      manufacturer_name: manufacturerNames.get(ex.id) ?? null,
      unit: ex.unit,
      txn_count: Number(stats?.txn_count ?? 0),
      first_date: stats?.first_date ?? null,
      last_date: stats?.last_date ?? null,
      starting_balance: starting,
      ending_balance: Number(stats?.ending_balance ?? 0),
      total_received: totalReceived,
      total_issued: Number(stats?.total_issued ?? 0),
      waste_issued: wasteIssued,
      waste_pct: wastePct === null ? null : Number(wastePct.toFixed(2)),
    } satisfies ExtractSummary;
  });

  const q = params.search?.trim().toLowerCase();
  if (q) {
    summaries = summaries.filter(
      (s) =>
        s.item_no.toLowerCase().includes(q) ||
        (s.manufacturer_name?.toLowerCase().includes(q) ?? false),
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
    case "manufacturer_name":
      return (a.manufacturer_name ?? "").localeCompare(b.manufacturer_name ?? "");
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

  const manufacturerNames = await loadManufacturerNamesByExtractId(supabase);

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
    manufacturer_name: manufacturerNames.get(extract.id) ?? null,
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
 * Upsert an extract and its parsed rows. Manual entries are merged into the
 * master ledger by date with balances recomputed. Screenshot uploads dedupe by
 * signature as before.
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

  if (parsed.source_filename === "manual-entry") {
    return commitManualExtract(
      supabase,
      parsed,
      extractId,
      itemNo,
      resolveCategory,
    );
  }

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

async function commitManualExtract(
  supabase: SupabaseClient,
  parsed: ParsedExtract,
  extractId: string,
  itemNo: string,
  resolveCategory: (row: ParsedExtract["rows"][number]) => ExtractCategory,
): Promise<CommitResult> {
  const existing = await loadExtractTransactions(supabase, extractId);
  const openingBalance =
    existing.length > 0
      ? deriveOpeningBalance(existing)
      : Number(parsed.opening_balance) || 0;

  let skipped = 0;
  const incoming: Array<
    Omit<ExtractTransaction, "id" | "extract_id"> & { formIndex: number }
  > = [];

  parsed.rows.forEach((row, formIndex) => {
    const date = normalizeExtractDate(row.txn_date);
    if (!date) {
      skipped++;
      return;
    }
    incoming.push({
      txn_date: date,
      seq: formIndex,
      order_no: row.order_no?.trim() || null,
      tran_code: row.tran_code?.trim() || null,
      from_to: row.from_to?.trim() || row.tran_code?.trim() || null,
      category: resolveCategory(row),
      lot_no: row.lot_no?.trim() || null,
      entered_qty:
        row.entered_qty === null || row.entered_qty === undefined
          ? null
          : Number(row.entered_qty),
      received: Number(row.received) || 0,
      issued: Number(row.issued) || 0,
      balance: null,
      status: row.status?.trim() || null,
      remark: row.remark?.trim() || null,
      source_filename: parsed.source_filename,
      formIndex,
    });
  });

  if (incoming.length === 0) {
    return {
      extractId,
      item_no: itemNo,
      total: 0,
      inserted: 0,
      overwritten: 0,
      skipped,
    };
  }

  const merged = mergeLedgerByDate(existing, incoming) as ExtractTransaction[];
  const updatedCount = await recomputeAndPersistLedger(
    supabase,
    extractId,
    merged,
    openingBalance,
    parsed.source_filename,
    parsed.source_path,
  );

  return {
    extractId,
    item_no: itemNo,
    total: incoming.length,
    inserted: incoming.length,
    overwritten: Math.max(0, updatedCount - existing.length),
    skipped,
  };
}

export interface UpdateExtractTransactionInput {
  txn_date?: string;
  tran_code?: string | null;
  order_no?: string | null;
  lot_no?: string | null;
  received?: number;
  issued?: number;
  remark?: string | null;
  status?: string | null;
}

export async function updateExtractTransaction(
  supabase: SupabaseClient,
  txnId: string,
  patch: UpdateExtractTransactionInput,
): Promise<void> {
  const { data: txn, error: txnError } = await supabase
    .from("extract_transactions")
    .select("id, extract_id")
    .eq("id", txnId)
    .maybeSingle();
  if (txnError) throw txnError;
  if (!txn) throw new Error("Transaction not found");

  const extractId = txn.extract_id as string;
  const ledger = await loadExtractTransactions(supabase, extractId);
  const index = ledger.findIndex((row) => row.id === txnId);
  if (index < 0) throw new Error("Transaction not found");

  const rules = await loadCategoryRules(supabase);
  const actionMappings = await loadActionCodeMappings(supabase);

  const current = ledger[index];
  const tranCode =
    patch.tran_code !== undefined
      ? patch.tran_code?.trim() || null
      : current.tran_code;
  const fromTo = tranCode ?? current.from_to;
  let category = current.category;
  if (patch.tran_code !== undefined) {
    const fromCode = resolveActionCodeCategory(tranCode, actionMappings);
    category = fromCode !== "uncategorized" ? fromCode : categorize(fromTo, rules);
  }

  let txnDate = current.txn_date;
  if (patch.txn_date !== undefined) {
    const normalized = normalizeExtractDate(patch.txn_date);
    if (!normalized) throw new Error("Invalid date");
    txnDate = normalized;
  }

  const updated: ExtractTransaction = {
    ...current,
    txn_date: txnDate,
    tran_code: tranCode,
    from_to: fromTo,
    category,
    order_no:
      patch.order_no !== undefined
        ? patch.order_no?.trim() || null
        : current.order_no,
    lot_no:
      patch.lot_no !== undefined ? patch.lot_no?.trim() || null : current.lot_no,
    received:
      patch.received !== undefined ? Number(patch.received) || 0 : current.received,
    issued: patch.issued !== undefined ? Number(patch.issued) || 0 : current.issued,
    remark:
      patch.remark !== undefined ? patch.remark?.trim() || null : current.remark,
    status:
      patch.status !== undefined ? patch.status?.trim() || null : current.status,
    source_filename: "manual-edit",
  };

  const nextLedger = [...ledger];
  nextLedger[index] = updated;
  const ordered = orderTransactions(nextLedger);
  const openingBalance = deriveOpeningBalance(ledger);
  await recomputeAndPersistLedger(
    supabase,
    extractId,
    ordered,
    openingBalance,
    "manual-edit",
  );
}

export async function deleteExtractTransaction(
  supabase: SupabaseClient,
  txnId: string,
): Promise<void> {
  const { data: txn, error: txnError } = await supabase
    .from("extract_transactions")
    .select("id, extract_id")
    .eq("id", txnId)
    .maybeSingle();
  if (txnError) throw txnError;
  if (!txn) throw new Error("Transaction not found");

  const extractId = txn.extract_id as string;
  const ledger = await loadExtractTransactions(supabase, extractId);
  const openingBalance = deriveOpeningBalance(ledger);
  const remaining = ledger.filter((row) => row.id !== txnId);

  const { error: deleteError } = await supabase
    .from("extract_transactions")
    .delete()
    .eq("id", txnId);
  if (deleteError) throw deleteError;

  if (remaining.length === 0) return;

  await recomputeAndPersistLedger(
    supabase,
    extractId,
    remaining,
    openingBalance,
    "manual-edit",
  );
}
