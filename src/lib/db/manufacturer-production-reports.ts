import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { orderNoMatchesPo } from "@/lib/extracts/po-match";
import {
  computeProductionReconciliation,
  type ReconciliationExtractRow,
  type ReconciliationSkuRow,
} from "@/lib/extracts/reconciliation";
import { getFormulasBySkuIds } from "@/lib/db/product-extract-formulas";
import type {
  ManufacturerProductionReport,
  ManufacturerProductionReportDetail,
  ManufacturerProductionReportInput,
  ManufacturerProductionReportLine,
  ProductionExtractAllocation,
  SuggestedProductionTransaction,
} from "@/types/database";

type ReportRow = {
  id: string;
  po_id: string;
  po_number: string;
  manufacturer: string;
  invoice_number: string | null;
  report_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  report_id: string;
  po_line_id: string | null;
  sku_id: string;
  qty_produced: number;
  uom: string;
  created_at: string;
  sku: { sku_code: string; name: string | null } | null;
};

type AllocationRow = {
  id: string;
  report_id: string;
  extract_transaction_id: string;
  allocated_kg: number;
  created_at: string;
  transaction: {
    id: string;
    extract_id: string;
    txn_date: string;
    order_no: string | null;
    issued: number;
    extract: { item_no: string; description: string | null } | null;
  } | null;
};

const REPORT_SELECT =
  "id, po_id, po_number, manufacturer, invoice_number, report_date, notes, created_at, updated_at";

const LINE_SELECT =
  "id, report_id, po_line_id, sku_id, qty_produced, uom, created_at, " +
  "sku:sku_id(sku_code, name)";

const ALLOCATION_SELECT =
  "id, report_id, extract_transaction_id, allocated_kg, created_at, " +
  "transaction:extract_transaction_id(id, extract_id, txn_date, order_no, issued, extract:extract_id(item_no, description))";

function mapReport(row: ReportRow): ManufacturerProductionReport {
  return {
    id: row.id,
    po_id: row.po_id,
    po_number: row.po_number,
    manufacturer: row.manufacturer,
    invoice_number: row.invoice_number,
    report_date: row.report_date,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapLine(row: LineRow): ManufacturerProductionReportLine {
  return {
    id: row.id,
    report_id: row.report_id,
    po_line_id: row.po_line_id,
    sku_id: row.sku_id,
    sku_code: row.sku?.sku_code ?? "",
    sku_name: row.sku?.name ?? null,
    qty_produced: Number(row.qty_produced),
    uom: row.uom,
    created_at: row.created_at,
  };
}

function mapAllocation(row: AllocationRow): ProductionExtractAllocation {
  return {
    id: row.id,
    report_id: row.report_id,
    extract_transaction_id: row.extract_transaction_id,
    allocated_kg: Number(row.allocated_kg),
    created_at: row.created_at,
    extract_id: row.transaction?.extract_id ?? "",
    extract_item_no: row.transaction?.extract?.item_no ?? "",
    extract_name: row.transaction?.extract?.description ?? null,
    txn_date: row.transaction?.txn_date ?? "",
    order_no: row.transaction?.order_no ?? null,
    issued_kg: Number(row.transaction?.issued ?? 0),
  };
}

export async function listProductionReportsByPo(
  supabase: SupabaseClient,
  poId: string,
): Promise<ManufacturerProductionReport[]> {
  const { data, error } = await supabase
    .from("manufacturer_production_reports")
    .select(REPORT_SELECT)
    .eq("po_id", poId)
    .order("report_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ReportRow[]).map(mapReport);
}

export async function getProductionReportDetail(
  supabase: SupabaseClient,
  reportId: string,
): Promise<ManufacturerProductionReportDetail | null> {
  const { data: reportData, error: reportError } = await supabase
    .from("manufacturer_production_reports")
    .select(REPORT_SELECT)
    .eq("id", reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!reportData) return null;

  const [linesRes, allocRes, formulasBySku] = await Promise.all([
    supabase
      .from("manufacturer_production_report_lines")
      .select(LINE_SELECT)
      .eq("report_id", reportId)
      .order("created_at"),
    supabase
      .from("production_extract_allocations")
      .select(ALLOCATION_SELECT)
      .eq("report_id", reportId)
      .order("created_at"),
    getFormulasBySkuIds(
      supabase,
      (
        await supabase
          .from("manufacturer_production_report_lines")
          .select("sku_id")
          .eq("report_id", reportId)
      ).data?.map((l) => l.sku_id as string) ?? [],
    ),
  ]);

  if (linesRes.error) throw linesRes.error;
  if (allocRes.error) throw allocRes.error;

  const lines = ((linesRes.data ?? []) as unknown as LineRow[]).map(mapLine);
  const allocations = ((allocRes.data ?? []) as unknown as AllocationRow[]).map(
    mapAllocation,
  );

  const reconciliationLines = lines.map((line) => ({
    sku_id: line.sku_id,
    qty_produced: line.qty_produced,
    formulas: (formulasBySku.get(line.sku_id) ?? []).map((f) => ({
      extract_id: f.extract_id,
      extract_kg_per_unit: f.extract_kg_per_unit,
    })),
  }));

  const reconciliation = computeProductionReconciliation(
    reconciliationLines,
    allocations.map((a) => ({
      extract_id: a.extract_id,
      allocated_kg: a.allocated_kg,
    })),
  );

  return {
    ...mapReport(reportData as ReportRow),
    lines,
    allocations,
    reconciliation: reconciliation.by_extract,
    reconciliation_by_sku: reconciliation.by_sku,
  };
}

export async function createProductionReport(
  supabase: SupabaseClient,
  input: ManufacturerProductionReportInput,
): Promise<ManufacturerProductionReportDetail> {
  if (input.lines.length === 0) {
    throw new Error("Add at least one production line.");
  }
  for (const line of input.lines) {
    if (line.qty_produced <= 0) {
      throw new Error("Quantity produced must be greater than zero.");
    }
  }

  const { data: report, error: reportError } = await supabase
    .from("manufacturer_production_reports")
    .insert({
      po_id: input.po_id,
      po_number: input.po_number.trim(),
      manufacturer: input.manufacturer?.trim() || "Cosmax",
      invoice_number: input.invoice_number?.trim() || null,
      report_date: input.report_date,
      notes: input.notes?.trim() || null,
    })
    .select(REPORT_SELECT)
    .single();
  if (reportError) throw reportError;

  const lineRows = input.lines.map((line) => ({
    report_id: report.id,
    po_line_id: line.po_line_id ?? null,
    sku_id: line.sku_id,
    qty_produced: line.qty_produced,
    uom: line.uom?.trim() || "pcs",
  }));

  const { error: linesError } = await supabase
    .from("manufacturer_production_report_lines")
    .insert(lineRows);
  if (linesError) throw linesError;

  const detail = await getProductionReportDetail(supabase, report.id);
  if (!detail) throw new Error("Failed to load created report.");
  return detail;
}

export async function deleteProductionReport(
  supabase: SupabaseClient,
  reportId: string,
): Promise<void> {
  const { error } = await supabase
    .from("manufacturer_production_reports")
    .delete()
    .eq("id", reportId);
  if (error) throw error;
}

export interface AllocationSaveInput {
  extract_transaction_id: string;
  allocated_kg: number;
}

export async function saveProductionAllocations(
  supabase: SupabaseClient,
  reportId: string,
  allocations: AllocationSaveInput[],
): Promise<ManufacturerProductionReportDetail> {
  for (const alloc of allocations) {
    if (alloc.allocated_kg <= 0) {
      throw new Error("Allocated kg must be greater than zero.");
    }
  }

  const { error: deleteError } = await supabase
    .from("production_extract_allocations")
    .delete()
    .eq("report_id", reportId);
  if (deleteError) throw deleteError;

  if (allocations.length > 0) {
    const { error: insertError } = await supabase
      .from("production_extract_allocations")
      .insert(
        allocations.map((a) => ({
          report_id: reportId,
          extract_transaction_id: a.extract_transaction_id,
          allocated_kg: a.allocated_kg,
        })),
      );
    if (insertError) throw insertError;
  }

  const detail = await getProductionReportDetail(supabase, reportId);
  if (!detail) throw new Error("Report not found.");
  return detail;
}

type ProdTxnRow = {
  id: string;
  extract_id: string;
  txn_date: string;
  order_no: string | null;
  issued: number;
  remark: string | null;
  extract: { item_no: string; description: string | null } | null;
};

export async function suggestProductionTransactions(
  supabase: SupabaseClient,
  poNumber: string,
  excludeReportId?: string,
): Promise<SuggestedProductionTransaction[]> {
  const rows = (await fetchAllRows(() =>
    supabase
      .from("extract_transactions")
      .select(
        "id, extract_id, txn_date, order_no, issued, remark, extract:extract_id(item_no, description)",
      )
      .eq("category", "production")
      .gt("issued", 0),
  )) as unknown as ProdTxnRow[];

  const matched = rows.filter((row) =>
    orderNoMatchesPo(row.order_no, poNumber),
  );

  const allocatedElsewhere = new Set<string>();
  if (matched.length > 0) {
    let allocQuery = supabase
      .from("production_extract_allocations")
      .select("extract_transaction_id, report_id")
      .in(
        "extract_transaction_id",
        matched.map((r) => r.id),
      );
    const { data: existing, error } = await allocQuery;
    if (error) throw error;
    for (const row of existing ?? []) {
      if (excludeReportId && row.report_id === excludeReportId) continue;
      allocatedElsewhere.add(row.extract_transaction_id as string);
    }
  }

  return matched.map((row) => {
    const extract = Array.isArray(row.extract) ? row.extract[0] : row.extract;
    return {
      id: row.id,
      extract_id: row.extract_id,
      extract_item_no: extract?.item_no ?? "",
      extract_name: extract?.description ?? null,
      txn_date: row.txn_date,
      order_no: row.order_no,
      issued_kg: Number(row.issued),
      remark: row.remark,
      already_allocated: allocatedElsewhere.has(row.id),
    };
  });
}

export type {
  ReconciliationExtractRow,
  ReconciliationSkuRow,
};
