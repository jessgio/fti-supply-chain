"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ImageUp, Trash2 } from "lucide-react";
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
import {
  categorize,
  EXTRACT_CATEGORIES,
  EXTRACT_CATEGORY_LABELS,
} from "@/lib/extracts/categories";
import { formatNumber } from "@/lib/utils";
import type {
  ExtractCategory,
  ParsedExtract,
  ParsedExtractRow,
} from "@/types/database";

interface ExtractUploadProps {
  onCommitted?: () => void;
}

export function ExtractUpload({ onCommitted }: ExtractUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedExtract | null>(null);

  // Recompute the running-balance check live so it updates as rows are edited.
  const rowChecks = useMemo(() => {
    const checks: { ok: boolean; expected: number | null }[] = [];
    let prev: number | null = null;
    for (const r of parsed?.rows ?? []) {
      const received = Number(r.received) || 0;
      const issued = Number(r.issued) || 0;
      const balance =
        r.balance === null || r.balance === undefined ? null : Number(r.balance);
      const expected =
        prev === null ? null : Number((prev + received - issued).toFixed(5));
      let ok = true;
      if (expected !== null && balance !== null) {
        ok = Math.abs(expected - balance) < 0.001;
      }
      checks.push({ ok, expected });
      if (balance !== null) prev = balance;
    }
    return checks;
  }, [parsed]);

  const warnings = useMemo(
    () => rowChecks.filter((c) => !c.ok).length,
    [rowChecks],
  );

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    setError(null);
    setStatus(null);
    setParsed(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extracts/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to read screenshot");
      setParsed(data.parsed as ParsedExtract);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read screenshot");
    } finally {
      setParsing(false);
    }
  }

  function updateRow(index: number, patch: Partial<ParsedExtractRow>) {
    setParsed((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (patch.from_to !== undefined) {
          next.category = categorize(patch.from_to);
        }
        return next;
      });
      return { ...prev, rows };
    });
  }

  function removeRow(index: number) {
    setParsed((prev) =>
      prev ? { ...prev, rows: prev.rows.filter((_, i) => i !== index) } : prev,
    );
  }

  async function handleCommit() {
    if (!parsed) return;
    if (!parsed.item_no.trim()) {
      setError("Item No is required before saving.");
      return;
    }
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
      setParsed(null);
      setFile(null);
      onCommitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload extract screenshot</CardTitle>
        <CardDescription>
          Upload a monthly screenshot from the manufacturer. It is read
          automatically into ledger rows you can review and edit before saving.
          Overlapping rows from previous months are detected and overwritten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!parsed && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-4 hover:bg-stone-100">
              <ImageUp className="h-5 w-5 text-stone-500" />
              <span className="text-sm font-medium text-stone-700">
                {file ? file.name : "Choose screenshot (PNG, JPG, WEBP)"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setStatus(null);
                  setError(null);
                }}
              />
            </label>
            <Button disabled={!file || parsing} onClick={handleParse}>
              {parsing ? "Reading…" : "Read screenshot"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {status && (
          <p className="text-sm text-emerald-700" role="status">
            {status}
          </p>
        )}

        {parsed && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500">
                  Item No
                </label>
                <Input
                  value={parsed.item_no}
                  onChange={(e) =>
                    setParsed({ ...parsed, item_no: e.target.value })
                  }
                  placeholder="e.g. 6045758"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500">
                  Description
                </label>
                <Input
                  value={parsed.description ?? ""}
                  onChange={(e) =>
                    setParsed({ ...parsed, description: e.target.value })
                  }
                  placeholder="Extract description"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-stone-600">
                {parsed.rows.length} rows parsed
              </span>
              {warnings > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {warnings} row(s) fail the running-balance check — review
                  highlighted rows
                </span>
              )}
            </div>

            <div className="max-h-[28rem] overflow-auto rounded-lg border border-stone-200">
              <table className="w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-28" />
                  <col className="w-44" />
                  <col className="w-44" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-10" />
                </colgroup>
                <thead className="sticky top-0 bg-stone-50">
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">FROM/TO</th>
                    <th className="px-2 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">Lot</th>
                    <th className="px-2 py-2 text-right font-medium">Received</th>
                    <th className="px-2 py-2 text-right font-medium">Issued</th>
                    <th className="px-2 py-2 text-right font-medium">Balance</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row, index) => {
                    const check = rowChecks[index];
                    const bad = check ? !check.ok : false;
                    return (
                      <tr
                        key={index}
                        className={`border-b border-stone-100 ${bad ? "bg-amber-50" : ""}`}
                      >
                        <td className="px-2 py-1">
                          <Input
                            className="h-8 w-full px-2 text-xs"
                            value={row.txn_date}
                            onChange={(e) =>
                              updateRow(index, { txn_date: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            className="h-8 w-full px-2 text-xs"
                            value={row.from_to ?? ""}
                            onChange={(e) =>
                              updateRow(index, { from_to: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Select
                            className="h-8 w-full px-2 text-xs"
                            value={row.category ?? "uncategorized"}
                            onChange={(e) =>
                              updateRow(index, {
                                category: e.target.value as ExtractCategory,
                              })
                            }
                          >
                            {EXTRACT_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {EXTRACT_CATEGORY_LABELS[c]}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-2 py-1 text-stone-600">
                          {row.lot_no ?? "—"}
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            step="any"
                            className="h-8 w-24 px-2 text-right text-xs"
                            value={row.received}
                            onChange={(e) =>
                              updateRow(index, {
                                received: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            step="any"
                            className="h-8 w-24 px-2 text-right text-xs"
                            value={row.issued}
                            onChange={(e) =>
                              updateRow(index, {
                                issued: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            step="any"
                            className={`h-8 w-24 px-2 text-right text-xs ${
                              bad ? "border-amber-400" : ""
                            }`}
                            value={row.balance ?? ""}
                            onChange={(e) =>
                              updateRow(index, {
                                balance:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                          {bad && check?.expected != null && (
                            <button
                              type="button"
                              title="Set balance to the value implied by the running total"
                              onClick={() =>
                                updateRow(index, { balance: check.expected })
                              }
                              className="mt-0.5 block w-24 truncate text-right text-[10px] text-amber-700 hover:underline"
                            >
                              ≠ expected {formatNumber(check.expected, 3)}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
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
            </div>

            <div className="flex items-center gap-3">
              <Button disabled={committing} onClick={handleCommit}>
                {committing ? "Saving…" : "Save to ledger"}
              </Button>
              <Button
                variant="outline"
                disabled={committing}
                onClick={() => {
                  setParsed(null);
                  setFile(null);
                }}
              >
                Discard
              </Button>
              <span className="text-xs text-stone-400">
                Total in:{" "}
                {formatNumber(
                  parsed.rows.reduce((s, r) => s + (Number(r.received) || 0), 0),
                  3,
                )}{" "}
                · Total out:{" "}
                {formatNumber(
                  parsed.rows.reduce((s, r) => s + (Number(r.issued) || 0), 0),
                  3,
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
