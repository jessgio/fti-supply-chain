"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calculator,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import type {
  ManufacturerProductionReport,
  ManufacturerProductionReportDetail,
  PurchaseOrder,
  SuggestedProductionTransaction,
} from "@/types/database";

interface PoProductionReportsSectionProps {
  po: PurchaseOrder;
}

interface NewLineDraft {
  po_line_id: string;
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  qty_produced: string;
}

function varianceClass(variancePct: number | null): string {
  if (variancePct == null) return "text-stone-600";
  const abs = Math.abs(variancePct);
  if (abs <= 5) return "text-emerald-700";
  if (abs <= 15) return "text-amber-700";
  return "text-rose-700";
}

export function PoProductionReportsSection({ po }: PoProductionReportsSectionProps) {
  const [reports, setReports] = useState<ManufacturerProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailReport, setDetailReport] =
    useState<ManufacturerProductionReportDetail | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedProductionTransaction[]>(
    [],
  );
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());
  const [savingAllocations, setSavingAllocations] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [manufacturer, setManufacturer] = useState("Cosmax");
  const [notes, setNotes] = useState("");
  const [lineDrafts, setLineDrafts] = useState<NewLineDraft[]>([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/production-reports`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reports");
      setReports(data.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [po.id]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function openCreateDialog() {
    setInvoiceNumber("");
    setReportDate(new Date().toISOString().slice(0, 10));
    setManufacturer("Cosmax");
    setNotes("");
    setLineDrafts(
      (po.lines ?? []).map((line) => ({
        po_line_id: line.id,
        sku_id: line.sku_id,
        sku_code: line.sku_code ?? "",
        sku_name: line.sku_name ?? null,
        qty_produced: "",
      })),
    );
    setCreateOpen(true);
    setError(null);
  }

  async function openDetail(reportId: string) {
    setError(null);
    try {
      const [detailRes, suggRes] = await Promise.all([
        fetch(`/api/procurement/pos/${po.id}/production-reports/${reportId}`),
        fetch(
          `/api/procurement/pos/${po.id}/production-reports?suggestions=1&exclude=${reportId}`,
        ),
      ]);
      const detailData = await detailRes.json();
      const suggData = await suggRes.json();
      if (!detailRes.ok) {
        throw new Error(detailData.error ?? "Failed to load report");
      }
      setDetailReport(detailData.report);
      const fromAllocations: SuggestedProductionTransaction[] = (
        detailData.report.allocations ?? []
      ).map(
        (a: {
          extract_transaction_id: string;
          extract_id: string;
          extract_item_no: string;
          extract_name: string | null;
          txn_date: string;
          order_no: string | null;
          issued_kg: number;
        }) => ({
          id: a.extract_transaction_id,
          extract_id: a.extract_id,
          extract_item_no: a.extract_item_no,
          extract_name: a.extract_name,
          txn_date: a.txn_date,
          order_no: a.order_no,
          issued_kg: a.issued_kg,
          remark: null,
          already_allocated: false,
        }),
      );
      const merged = [...fromAllocations];
      for (const s of suggData.suggestions ?? []) {
        if (!merged.some((m) => m.id === s.id)) merged.push(s);
      }
      setSuggestions(merged);
      setSelectedTxnIds(
        new Set(
          (detailData.report.allocations ?? []).map(
            (a: { extract_transaction_id: string }) => a.extract_transaction_id,
          ),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    }
  }

  async function handleCreate() {
    const lines = lineDrafts
      .map((line) => ({
        po_line_id: line.po_line_id,
        sku_id: line.sku_id,
        qty_produced: Number(line.qty_produced),
      }))
      .filter((line) => Number.isFinite(line.qty_produced) && line.qty_produced > 0);

    if (!reportDate.trim()) {
      setError("Report date is required.");
      return;
    }
    if (lines.length === 0) {
      setError("Enter at least one quantity produced.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/production-reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_number: invoiceNumber.trim() || null,
            report_date: reportDate,
            manufacturer,
            notes: notes.trim() || null,
            lines,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create report");
      setCreateOpen(false);
      await loadReports();
      if (data.report?.id) {
        await openDetail(data.report.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create report");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Delete this production report? Allocations will be removed.")) {
      return;
    }
    setDeletingId(reportId);
    setError(null);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/production-reports/${reportId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (detailReport?.id === reportId) setDetailReport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSaveAllocations() {
    if (!detailReport) return;

    const uniqueIds = [...selectedTxnIds];

    const allocations = uniqueIds.map((txnId) => {
      const existing = detailReport.allocations.find(
        (a) => a.extract_transaction_id === txnId,
      );
      const suggestion = suggestions.find((s) => s.id === txnId);
      const issued = existing?.issued_kg ?? suggestion?.issued_kg ?? 0;
      return {
        extract_transaction_id: txnId,
        allocated_kg: issued,
      };
    });

    setSavingAllocations(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/production-reports/${detailReport.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allocations }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save allocations");
      setDetailReport(data.report);
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save allocations");
    } finally {
      setSavingAllocations(false);
    }
  }

  const extractLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of detailReport?.allocations ?? []) {
      map.set(
        a.extract_id,
        a.extract_name
          ? `${a.extract_item_no} — ${a.extract_name}`
          : a.extract_item_no,
      );
    }
    for (const s of suggestions) {
      if (!map.has(s.extract_id)) {
        map.set(
          s.extract_id,
          s.extract_name
            ? `${s.extract_item_no} — ${s.extract_name}`
            : s.extract_item_no,
        );
      }
    }
    return map;
  }, [detailReport, suggestions]);

  const skuLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of detailReport?.lines ?? []) {
      map.set(
        line.sku_id,
        line.sku_name ? `${line.sku_code} — ${line.sku_name}` : line.sku_code,
      );
    }
    return map;
  }, [detailReport]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Production reconciliation</CardTitle>
            <CardDescription>
              Record manufacturer invoice quantities and link production ledger
              rows to compare actual extract usage vs formula estimates.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/dashboard/extracts/formulas">
              <Button type="button" size="sm" variant="ghost">
                <Calculator className="mr-2 h-3.5 w-3.5" />
                Formulas
              </Button>
            </Link>
            <Button type="button" size="sm" variant="outline" onClick={openCreateDialog}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && !createOpen && !detailReport && (
            <p className="mb-3 text-sm text-red-600">{error}</p>
          )}
          {loading ? (
            <div className="flex items-center text-sm text-stone-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : reports.length === 0 ? (
            <p className="text-sm text-stone-500">
              No production reports yet. Add one from a manufacturer invoice (e.g.
              Cosmax Faktur Penjualan) with finished quantities per SKU.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Manufacturer</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="border-b border-stone-100">
                      <td className="py-2 pr-4">{formatDate(report.report_date)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {report.invoice_number ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{report.manufacturer}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void openDetail(report.id)}
                          >
                            Reconcile
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={deletingId === report.id}
                            onClick={() => void handleDelete(report.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New production report"
        description={`Enter quantities from the manufacturer invoice for PO ${po.po_number}.`}
        className="max-w-lg"
      >
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500">
                  Invoice number
                </label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. 2025/VIII/CI/INV037"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500">
                  Invoice date
                </label>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Manufacturer
              </label>
              <Input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Quantities produced
              </label>
              <div className="space-y-2">
                {lineDrafts.map((line, index) => (
                  <div
                    key={line.po_line_id}
                    className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.sku_code}</p>
                      {line.sku_name && (
                        <p className="truncate text-xs text-stone-500">
                          {line.sku_name}
                        </p>
                      )}
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className="w-28 text-right"
                      placeholder="pcs"
                      value={line.qty_produced}
                      onChange={(e) =>
                        setLineDrafts((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? { ...row, qty_produced: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
            {error && createOpen && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={creating} onClick={() => void handleCreate()}>
              {creating ? "Saving…" : "Create report"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={detailReport != null}
        onClose={() => setDetailReport(null)}
        title="Production reconciliation"
        description={
          detailReport
            ? `${detailReport.invoice_number ? `Invoice ${detailReport.invoice_number} · ` : ""}${formatDate(detailReport.report_date)} · ${detailReport.manufacturer}`
            : undefined
        }
        className="max-w-3xl"
      >
        {detailReport && (
          <div className="max-h-[70vh] space-y-6 overflow-y-auto">
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-stone-800">
                Produced quantities
              </h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-1.5 pr-3 font-medium">SKU</th>
                      <th className="py-1.5 text-right font-medium">Qty (pcs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailReport.lines.map((line) => (
                      <tr key={line.id} className="border-b border-stone-100">
                        <td className="py-1.5 pr-3">
                          {line.sku_name
                            ? `${line.sku_code} — ${line.sku_name}`
                            : line.sku_code}
                        </td>
                        <td className="py-1.5 text-right font-medium">
                          {formatNumber(line.qty_produced, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium text-stone-800">
                  Link production ledger rows
                </h3>
                <p className="text-xs text-stone-500">
                  Select production-category ledger rows whose Order No matches this
                  PO ({po.po_number}). Set Order No on ledger entries when recording
                  extract usage.
                </p>
                {suggestions.length === 0 &&
                detailReport.allocations.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    No matching production rows found for this PO.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200">
                    {[...suggestions]
                      .sort((a, b) => a.txn_date.localeCompare(b.txn_date))
                      .map((txn) => {
                        const checked = selectedTxnIds.has(txn.id);
                        const disabled = txn.already_allocated && !checked;
                        return (
                          <label
                            key={txn.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 border-b border-stone-100 px-3 py-2 last:border-0",
                              disabled && "cursor-not-allowed opacity-50",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) => {
                                setSelectedTxnIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(txn.id);
                                  else next.delete(txn.id);
                                  return next;
                                });
                              }}
                            />
                            <div className="min-w-0 flex-1 text-sm">
                              <p className="font-medium">
                                {txn.extract_item_no}
                                {txn.extract_name ? ` — ${txn.extract_name}` : ""}
                              </p>
                              <p className="text-xs text-stone-500">
                                {formatDate(txn.txn_date)} · Order{" "}
                                {txn.order_no ?? "—"} ·{" "}
                                {formatNumber(txn.issued_kg, 5)} kg issued
                                {txn.already_allocated && !checked && (
                                  <span className="text-amber-700">
                                    {" "}
                                    · linked to another report
                                  </span>
                                )}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                )}
                <Button
                  size="sm"
                  disabled={savingAllocations}
                  onClick={() => void handleSaveAllocations()}
                >
                  {savingAllocations ? "Saving…" : "Save linked rows"}
                </Button>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium text-stone-800">
                  Formula vs actual (kg per pc)
                </h3>
                {detailReport.reconciliation.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    Add{" "}
                    <Link
                      href="/dashboard/extracts/formulas"
                      className="text-emerald-700 underline"
                    >
                      extract formulas
                    </Link>{" "}
                    and link production rows to see comparison.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-stone-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50">
                        <tr className="text-stone-500">
                          <th className="px-3 py-2 font-medium">Extract</th>
                          <th className="px-3 py-2 text-right font-medium">
                            Formula kg/pc
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Actual kg/pc
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Expected kg
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Actual kg
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Variance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailReport.reconciliation.map((row) => (
                          <tr
                            key={row.extract_id}
                            className="border-t border-stone-100"
                          >
                            <td className="px-3 py-2">
                              {extractLabels.get(row.extract_id) ?? row.extract_id}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.expected_kg_per_unit != null
                                ? formatNumber(row.expected_kg_per_unit, 6)
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {row.actual_kg_per_unit != null
                                ? formatNumber(row.actual_kg_per_unit, 6)
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-stone-600">
                              {formatNumber(row.expected_kg, 5)}
                            </td>
                            <td className="px-3 py-2 text-right text-stone-600">
                              {formatNumber(row.actual_kg, 5)}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2 text-right font-medium",
                                varianceClass(row.variance_pct),
                              )}
                            >
                              {row.variance_pct != null
                                ? `${row.variance_pct > 0 ? "+" : ""}${row.variance_pct}%`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailReport.reconciliation_by_sku.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-stone-600">
                      Expected usage by SKU
                    </summary>
                    <table className="mt-2 w-full text-left text-xs">
                      <thead>
                        <tr className="text-stone-500">
                          <th className="py-1 pr-2">SKU</th>
                          <th className="py-1 pr-2 text-right">Qty</th>
                          <th className="py-1 pr-2 text-right">Formula kg/pc</th>
                          <th className="py-1 text-right">Expected kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailReport.reconciliation_by_sku.map((row, i) => (
                          <tr key={`${row.sku_id}-${row.extract_id}-${i}`}>
                            <td className="py-1 pr-2">
                              {skuLabels.get(row.sku_id) ?? row.sku_id}
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {formatNumber(row.qty_produced, 0)}
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {formatNumber(row.extract_kg_per_unit, 6)}
                            </td>
                            <td className="py-1 text-right">
                              {formatNumber(row.expected_kg, 5)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </section>

              {error && detailReport && (
                <p className="text-sm text-red-600">{error}</p>
              )}
          </div>
        )}
      </Dialog>
    </>
  );
}
