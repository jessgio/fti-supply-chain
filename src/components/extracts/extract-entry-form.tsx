"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  EXTRACT_CATEGORY_LABELS,
  EXTRACT_CATEGORY_STYLES,
} from "@/lib/extracts/categories";
import { resolveActionCodeCategory } from "@/lib/extracts/mappings";
import { cn, formatNumber } from "@/lib/utils";
import type {
  ExtractActionCodeMapping,
  ExtractSummary,
  ParsedExtract,
  ParsedExtractRow,
} from "@/types/database";

interface ExtractEntryFormProps {
  onCommitted?: () => void;
}

type FormExtractRow = Omit<ParsedExtractRow, "received" | "issued"> & {
  received: string;
  issued: string;
};

function parseNumeric(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createEmptyRow(): FormExtractRow {
  return {
    txn_date: "",
    order_no: null,
    tran_code: null,
    from_to: null,
    lot_no: null,
    entered_qty: null,
    received: "",
    issued: "",
    balance: null,
    status: null,
    remark: null,
    category: "uncategorized",
  };
}

function recomputeBalances(
  rows: FormExtractRow[],
  openingBalance: number,
): FormExtractRow[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort(
    (a, b) =>
      a.row.txn_date.localeCompare(b.row.txn_date) || a.index - b.index,
  );

  let balance = openingBalance;
  const balanceByIndex = new Map<number, number>();
  for (const { row, index } of indexed) {
    if (!row.txn_date.trim()) continue;
    const received = parseNumeric(row.received);
    const issued = parseNumeric(row.issued);
    balance = Number((balance + received - issued).toFixed(5));
    balanceByIndex.set(index, balance);
  }

  return rows.map((row, index) => ({
    ...row,
    balance: balanceByIndex.get(index) ?? null,
  }));
}

export function ExtractEntryForm({ onCommitted }: ExtractEntryFormProps) {
  const [extracts, setExtracts] = useState<ExtractSummary[]>([]);
  const [actionCodes, setActionCodes] = useState<ExtractActionCodeMapping[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [openingBalanceInput, setOpeningBalanceInput] = useState("");
  const [rows, setRows] = useState<FormExtractRow[]>([createEmptyRow()]);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [extractsRes, codesRes] = await Promise.all([
        fetch("/api/extracts?sort=item_no&sort_dir=asc"),
        fetch("/api/extracts/mappings/action-codes"),
      ]);
      const extractsData = await extractsRes.json();
      const codesData = await codesRes.json();
      if (extractsRes.ok) setExtracts(extractsData.extracts ?? []);
      if (codesRes.ok) setActionCodes(codesData.mappings ?? []);
    } catch {
      setExtracts([]);
      setActionCodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedExtract = useMemo(
    () => extracts.find((ex) => ex.id === selectedId) ?? null,
    [extracts, selectedId],
  );

  const codeOptions = useMemo(
    () =>
      [...actionCodes]
        .map((m) => m.action_code)
        .sort((a, b) => a.localeCompare(b)),
    [actionCodes],
  );

  const openingBalance = useMemo(
    () => parseNumeric(openingBalanceInput),
    [openingBalanceInput],
  );

  function handleSelectExtract(id: string) {
    setSelectedId(id);
    setError(null);
    setStatus(null);

    const ex = extracts.find((e) => e.id === id);
    if (!ex) {
      setOpeningBalanceInput("");
      setRows([createEmptyRow()]);
      return;
    }
    const balanceStr = String(ex.ending_balance);
    setOpeningBalanceInput(balanceStr);
    setRows(recomputeBalances([createEmptyRow()], ex.ending_balance));
  }

  function handleOpeningBalanceChange(value: string) {
    setOpeningBalanceInput(value);
    setRows((prev) => recomputeBalances(prev, parseNumeric(value)));
  }

  function updateRow(index: number, patch: Partial<FormExtractRow>) {
    setRows((prev) => {
      const next = prev.map((row, i) => {
        if (i !== index) return row;
        const updated = { ...row, ...patch };
        if (patch.tran_code !== undefined) {
          const code = patch.tran_code?.trim() || null;
          updated.tran_code = code;
          updated.from_to = code;
          updated.category = resolveActionCodeCategory(code, actionCodes);
        }
        return updated;
      });
      return recomputeBalances(next, openingBalance);
    });
  }

  function addRow() {
    setRows((prev) =>
      recomputeBalances([...prev, createEmptyRow()], openingBalance),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return recomputeBalances(
        next.length > 0 ? next : [createEmptyRow()],
        openingBalance,
      );
    });
  }

  function resetForm() {
    setSelectedId("");
    setOpeningBalanceInput("");
    setRows([createEmptyRow()]);
    setError(null);
    setStatus(null);
  }

  async function handleCommit() {
    if (!selectedExtract) {
      setError("Select an item number before saving.");
      return;
    }

    const datedRows = rows.filter((r) => r.txn_date.trim());
    if (datedRows.length === 0) {
      setError("Add at least one row with a date.");
      return;
    }

    const missingCode = datedRows.find((r) => !r.tran_code?.trim());
    if (missingCode) {
      setError("Every row needs an action code.");
      return;
    }

    const parsed: ParsedExtract = {
      item_no: selectedExtract.item_no,
      description: selectedExtract.description,
      unit: "kg",
      extract_id: selectedExtract.id,
      opening_balance: openingBalance,
      rows: recomputeBalances(datedRows, openingBalance).map((row) => ({
        ...row,
        received: parseNumeric(row.received),
        issued: parseNumeric(row.issued),
        category: resolveActionCodeCategory(row.tran_code, actionCodes),
      })),
      source_path: null,
      source_filename: "manual-entry",
    };

    setCommitting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/extracts/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setStatus(
        `Saved extract ${data.item_no}: ${data.inserted} new, ${data.overwritten} overwritten` +
          (data.skipped ? `, ${data.skipped} skipped` : "") +
          ".",
      );
      resetForm();
      await loadData();
      onCommitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setCommitting(false);
    }
  }

  const totals = useMemo(() => {
    const dated = rows.filter((r) => r.txn_date.trim());
    return {
      received: dated.reduce((s, r) => s + parseNumeric(r.received), 0),
      issued: dated.reduce((s, r) => s + parseNumeric(r.issued), 0),
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Enter extract movements</CardTitle>
            <CardDescription>
              Select an extract item number, then record movements using
              manufacturer action codes. Codes map to categories automatically.
            </CardDescription>
          </div>
          <Link
            href="/dashboard/extracts/mappings"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-50"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Manage mappings
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">
            Item No
          </label>
          <Select
            value={selectedId}
            onChange={(e) => handleSelectExtract(e.target.value)}
            disabled={loading || committing}
          >
            <option value="">
              {loading
                ? "Loading extracts…"
                : extracts.length === 0
                  ? "No extracts — update the DN catalog first"
                  : "Select item number…"}
            </option>
            {extracts.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.item_no === ex.description
                  ? ex.item_no
                  : `${ex.item_no} — ${ex.description}`}
              </option>
            ))}
          </Select>
          {!loading && extracts.length === 0 && (
            <p className="mt-1.5 text-xs text-stone-500">
              Add extracts in the{" "}
              <Link
                href="/dashboard/extract-inbound-delivery-notes/codes"
                className="text-emerald-700 hover:underline"
              >
                Extract Code DN catalog
              </Link>
              .
            </p>
          )}
        </div>

        {selectedExtract && (
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Starting balance (kg)
              </label>
              <Input
                type="number"
                min="0"
                step="any"
                className="text-right"
                value={openingBalanceInput}
                placeholder="0"
                onChange={(e) => handleOpeningBalanceChange(e.target.value)}
                disabled={committing}
              />
            </div>
            <p className="text-xs text-stone-500">
              Ledger ending balance:{" "}
              <span className="font-medium text-stone-700">
                {formatNumber(selectedExtract.ending_balance, 3)} kg
              </span>
              . Adjust starting balance if needed before adding movements.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-stone-600">
            {rows.filter((r) => r.txn_date.trim()).length} movement
            {rows.filter((r) => r.txn_date.trim()).length === 1 ? "" : "s"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={committing || !selectedId}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add row
          </Button>
        </div>

        <div className="overflow-auto rounded-lg border border-stone-200">
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-32" />
              <col className="w-28" />
              <col className="w-28" />
              <col />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-10" />
            </colgroup>
            <thead className="bg-stone-50">
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Order No</th>
                <th className="px-2 py-2 font-medium">Action code</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 text-right font-medium">Inbound (kg)</th>
                <th className="px-2 py-2 text-right font-medium">Outbound (kg)</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const category =
                  row.category ??
                  resolveActionCodeCategory(row.tran_code, actionCodes);
                const unmapped =
                  row.tran_code?.trim() && category === "uncategorized";
                return (
                  <tr key={index} className="border-b border-stone-100">
                    <td className="px-2 py-1">
                      <Input
                        type="date"
                        className="h-8 w-full px-2 text-xs"
                        value={row.txn_date}
                        onChange={(e) =>
                          updateRow(index, { txn_date: e.target.value })
                        }
                        disabled={committing || !selectedId}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8 w-full px-2 text-xs"
                        value={row.order_no ?? ""}
                        placeholder="PO FTI-28-…"
                        onChange={(e) =>
                          updateRow(index, {
                            order_no: e.target.value.trim() || null,
                          })
                        }
                        disabled={committing || !selectedId}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8 w-full px-2 text-xs"
                        list="extract-action-codes"
                        value={row.tran_code ?? ""}
                        placeholder="e.g. QAC"
                        onChange={(e) =>
                          updateRow(index, { tran_code: e.target.value })
                        }
                        disabled={committing || !selectedId}
                      />
                    </td>
                    <td className="px-2 py-1">
                      {row.tran_code?.trim() ? (
                        <Badge
                          className={cn(
                            "text-[10px] font-normal",
                            EXTRACT_CATEGORY_STYLES[category],
                            unmapped && "ring-1 ring-amber-400",
                          )}
                        >
                          {EXTRACT_CATEGORY_LABELS[category]}
                        </Badge>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                      {unmapped && (
                        <p className="mt-0.5 text-[10px] text-amber-700">
                          Unmapped —{" "}
                          <Link
                            href="/dashboard/extracts/mappings"
                            className="underline"
                          >
                            add code
                          </Link>
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="h-8 w-full px-2 text-right text-xs"
                        value={row.received}
                        placeholder="0"
                        onChange={(e) =>
                          updateRow(index, { received: e.target.value })
                        }
                        disabled={committing || !selectedId}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="h-8 w-full px-2 text-right text-xs"
                        value={row.issued}
                        placeholder="0"
                        onChange={(e) =>
                          updateRow(index, { issued: e.target.value })
                        }
                        disabled={committing || !selectedId}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        disabled={
                          committing || !selectedId || rows.length === 1
                        }
                        className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="extract-action-codes">
            {codeOptions.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {status && (
          <p className="text-sm text-emerald-700" role="status">
            {status}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={committing || !selectedId} onClick={handleCommit}>
            {committing ? "Saving…" : "Save to ledger"}
          </Button>
          <Button
            variant="outline"
            disabled={committing}
            onClick={resetForm}
          >
            Clear form
          </Button>
          <span className="text-xs text-stone-400">
            Total in: {formatNumber(totals.received, 3)} · Total out:{" "}
            {formatNumber(totals.issued, 3)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
