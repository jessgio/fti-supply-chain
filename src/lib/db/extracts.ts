import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  categorize,
  DEFAULT_CATEGORY_RULES,
} from "@/lib/extracts/categories";
import { resolveActionCodeCategory } from "@/lib/extracts/mappings";
import {
  annualizeIssuedUsage,
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
import { syncUnlinkedCatalogExtracts } from "@/lib/db/sync-extract-catalog";
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

async function runInParallelChunks<T>(
  items: T[],
  chunkSize: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(
      items.slice(i, i + chunkSize).map((item, j) => fn(item, i + j)),
    );
  }
}

function ledgerPersistRowChanged(
  original: Pick<
    ExtractTransaction,
    | "txn_date"
    | "seq"
    | "received"
    | "issued"
    | "balance"
    | "order_no"
    | "tran_code"
    | "from_to"
    | "lot_no"
    | "category"
    | "remark"
    | "status"
  >,
  next: LedgerPersistRow,
): boolean {
  return (
    original.txn_date !== next.txn_date ||
    original.seq !== next.seq ||
    original.received !== next.received ||
    original.issued !== next.issued ||
    (original.balance ?? 0) !== next.balance ||
    original.order_no !== next.order_no ||
    original.tran_code !== next.tran_code ||
    original.from_to !== next.from_to ||
    original.lot_no !== next.lot_no ||
    original.category !== next.category ||
    original.remark !== next.remark ||
    original.status !== next.status
  );
}

async function persistLedgerRows(
  supabase: SupabaseClient,
  rows: LedgerPersistRow[],
): Promise<void> {
  const now = new Date().toISOString();
  const inserts = rows.filter((row) => !row.id);
  const updates = rows.filter((row) => row.id);
  const PARALLEL = 25;

  await runInParallelChunks(updates, PARALLEL, async (row, i) => {
    const { error } = await supabase
      .from("extract_transactions")
      .update({
        signature: `__ledger_rewrite__:${row.id}:${i}:${now}`,
        updated_at: now,
      })
      .eq("id", row.id as string);
    if (error) throw error;
  });

  await runInParallelChunks(updates, PARALLEL, async (row) => {
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
  });

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
  const originalById = new Map(
    orderTransactions(rows)
      .filter((row) => row.id)
      .map((row) => [row.id, row]),
  );

  const ordered = orderTransactions(rows);
  const recomputed = recomputeLedgerChain(ordered, openingBalance);
  const persistRows = recomputed
    .map((row) => toLedgerPersistRow(row, extractId, sourceFilename, sourcePath))
    .filter((row) => {
      if (!row.id) return true;
      const original = originalById.get(row.id);
      if (!original) return true;
      return ledgerPersistRowChanged(original, row);
    });

  if (persistRows.length === 0) return 0;

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
  // Only link new catalog rows — skip re-syncing the full catalog on every list.
  await syncUnlinkedCatalogExtracts(supabase);

  const [{ data: catalogCodes, error }, statsRes] = await Promise.all([
    supabase
      .from("extract_codes")
      .select("id, item_code, extract_name, extract_id, is_active")
      .eq("is_active", true)
      .order("extract_name"),
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

  let summaries: ExtractSummary[] = (catalogCodes ?? [])
    .filter((code) => code.extract_id)
    .map((code) => {
      const extractId = code.extract_id as string;
      const stats = statsByExtract.get(extractId);
      const starting = Number(stats?.starting_balance ?? 0);
      const totalReceived = Number(stats?.total_received ?? 0);
      const wasteIssued = Number(stats?.waste_issued ?? 0);
      const denom = starting + totalReceived;
      const wastePct = denom > 0 ? (wasteIssued / denom) * 100 : null;
      const extractName = code.extract_name as string;

      const totalIssued = Number(stats?.total_issued ?? 0);
      const firstDate = stats?.first_date ?? null;
      const lastDate = stats?.last_date ?? null;

      return {
        id: extractId,
        item_no: code.item_code as string,
        description: extractName,
        manufacturer_name: extractName,
        unit: "kg",
        txn_count: Number(stats?.txn_count ?? 0),
        first_date: firstDate,
        last_date: lastDate,
        starting_balance: starting,
        ending_balance: Number(stats?.ending_balance ?? 0),
        total_received: totalReceived,
        total_issued: totalIssued,
        waste_issued: wasteIssued,
        waste_pct: wastePct === null ? null : Number(wastePct.toFixed(2)),
        usage_kg_per_year: annualizeIssuedUsage(
          totalIssued,
          firstDate,
          lastDate,
        ),
      } satisfies ExtractSummary;
    });

  const q = params.search?.trim().toLowerCase();
  if (q) {
    summaries = summaries.filter(
      (s) =>
        s.item_no.toLowerCase().includes(q) ||
        (s.manufacturer_name?.toLowerCase().includes(q) ?? false) ||
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
    usage_kg_per_year: stats.usage_kg_per_year,
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

  let extractId: string;

  if (parsed.source_filename === "manual-entry" && parsed.extract_id) {
    const { data, error } = await supabase
      .from("extracts")
      .select("id")
      .eq("id", parsed.extract_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Extract not found");
    extractId = data.id as string;
  } else {
    const { data, error } = await supabase
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
    if (error) throw error;
    extractId = data.id as string;
  }

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
    category =
      fromCode !== "uncategorized" ? fromCode : categorize(fromTo, rules);
  }

  let txnDate = current.txn_date;
  if (patch.txn_date !== undefined) {
    const normalized = normalizeExtractDate(patch.txn_date);
    if (!normalized) throw new Error("Invalid date");
    txnDate = normalized;
  }

  const dateChanged = txnDate !== current.txn_date;
  const updated: ExtractTransaction = {
    ...current,
    txn_date: txnDate,
    // When date moves, place the row after existing same-day rows so it
    // inserts chronologically instead of keeping its old seq position.
    seq: dateChanged ? Number.MAX_SAFE_INTEGER : current.seq,
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
      patch.received !== undefined
        ? Number(patch.received) || 0
        : current.received,
    issued:
      patch.issued !== undefined ? Number(patch.issued) || 0 : current.issued,
    remark:
      patch.remark !== undefined
        ? patch.remark?.trim() || null
        : current.remark,
    status:
      patch.status !== undefined
        ? patch.status?.trim() || null
        : current.status,
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

/**
 * Re-sort every ledger row by date and recompute running balances from the
 * opening balance. Use this to repair out-of-order or mismatched balances.
 */
export async function recalculateExtractLedger(
  supabase: SupabaseClient,
  extractId: string,
  openingBalanceOverride?: number,
): Promise<{ txn_count: number; opening_balance: number; ending_balance: number }> {
  const { data: extract, error: extractError } = await supabase
    .from("extracts")
    .select("id")
    .eq("id", extractId)
    .maybeSingle();
  if (extractError) throw extractError;
  if (!extract) throw new Error("Extract not found");

  const ledger = await loadExtractTransactions(supabase, extractId);
  if (ledger.length === 0) {
    return { txn_count: 0, opening_balance: 0, ending_balance: 0 };
  }

  const openingBalance =
    openingBalanceOverride !== undefined && Number.isFinite(openingBalanceOverride)
      ? Number(openingBalanceOverride)
      : deriveOpeningBalance(ledger);

  const ordered = orderTransactions(ledger);
  await recomputeAndPersistLedger(
    supabase,
    extractId,
    ordered,
    openingBalance,
    "ledger-recalculate",
  );

  const endingBalance = ordered.reduce(
    (balance, row) => Number((balance + row.received - row.issued).toFixed(5)),
    openingBalance,
  );

  return {
    txn_count: ordered.length,
    opening_balance: openingBalance,
    ending_balance: endingBalance,
  };
}
