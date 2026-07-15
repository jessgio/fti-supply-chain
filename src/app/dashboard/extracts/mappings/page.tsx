"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { PageShell } from "@/components/dashboard/page-shell";
import {
  EXTRACT_CATEGORIES,
  EXTRACT_CATEGORY_LABELS,
  EXTRACT_CATEGORY_STYLES,
} from "@/lib/extracts/categories";
import { cn } from "@/lib/utils";
import type {
  ExtractActionCodeMapping,
  ExtractCategory,
} from "@/types/database";

const EXTRACT_CATALOG_HREF = "/dashboard/extract-inbound-delivery-notes/codes";

export default function ExtractMappingsPage() {
  const [actionCodes, setActionCodes] = useState<ExtractActionCodeMapping[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newCodeCategory, setNewCodeCategory] =
    useState<ExtractCategory>("production");

  const loadMappings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const codesRes = await fetch("/api/extracts/mappings/action-codes");
      const codesData = await codesRes.json();
      if (!codesRes.ok) {
        throw new Error(codesData.error ?? "Failed to load action codes");
      }
      setActionCodes(codesData.mappings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  const sortedCodes = useMemo(
    () =>
      [...actionCodes].sort((a, b) =>
        a.action_code.localeCompare(b.action_code),
      ),
    [actionCodes],
  );

  async function addActionCode() {
    const action_code = newCode.trim();
    if (!action_code) return;
    setSavingId("new-code");
    setError(null);
    try {
      const res = await fetch("/api/extracts/mappings/action-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_code, category: newCodeCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add action code");
      setActionCodes((prev) => [...prev, data.mapping]);
      setNewCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSavingId(null);
    }
  }

  async function updateActionCode(
    id: string,
    patch: { action_code?: string; category?: ExtractCategory },
  ) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/extracts/mappings/action-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setActionCodes((prev) =>
        prev.map((row) => (row.id === id ? data.mapping : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function removeActionCode(id: string) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/extracts/mappings/action-codes/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setActionCodes((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <PageShell className="max-w-4xl space-y-6">
      <div>
        <Link
          href="/dashboard/extracts"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to extracts
        </Link>
        <h1 className="text-2xl font-semibold text-stone-900">
          Extract Action Codes
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Map manufacturer action codes (e.g. QAC, RNI) to internal ledger
          categories. OCR and ledger commit prefer these codes, then fall back
          to FROM/TO rules. Extract name ↔ item code lives in the Extract
          Inbound Catalog.
        </p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Extract name ↔ item code</CardTitle>
          <CardDescription>
            Manage extract names and FTI item codes in one place. The catalog
            drives the extract ledger, inbound delivery notes, and imports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={EXTRACT_CATALOG_HREF}>
            <Button type="button" variant="outline" size="sm">
              Open Extract Inbound Catalog
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action codes</CardTitle>
          <CardDescription>
            Manufacturer action codes map to internal movement categories when
            you enter ledger rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Action code
              </label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="e.g. QAC"
                disabled={savingId === "new-code"}
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Category
              </label>
              <Select
                value={newCodeCategory}
                onChange={(e) =>
                  setNewCodeCategory(e.target.value as ExtractCategory)
                }
                disabled={savingId === "new-code"}
              >
                {EXTRACT_CATEGORIES.filter((c) => c !== "uncategorized").map(
                  (c) => (
                    <option key={c} value={c}>
                      {EXTRACT_CATEGORY_LABELS[c]}
                    </option>
                  ),
                )}
              </Select>
            </div>
            <Button
              onClick={addActionCode}
              disabled={!newCode.trim() || savingId === "new-code"}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-stone-500">Loading action codes…</p>
          ) : sortedCodes.length === 0 ? (
            <p className="text-sm text-stone-500">No action codes yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="px-3 py-2 font-medium">Action code</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {sortedCodes.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100">
                      <td className="px-3 py-2">
                        <Input
                          className="h-8"
                          defaultValue={row.action_code}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (value && value !== row.action_code) {
                              updateActionCode(row.id, { action_code: value });
                            }
                          }}
                          disabled={savingId === row.id}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          className="h-8"
                          value={row.category}
                          onChange={(e) =>
                            updateActionCode(row.id, {
                              category: e.target.value as ExtractCategory,
                            })
                          }
                          disabled={savingId === row.id}
                        >
                          {EXTRACT_CATEGORIES.filter(
                            (c) => c !== "uncategorized",
                          ).map((c) => (
                            <option key={c} value={c}>
                              {EXTRACT_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeActionCode(row.id)}
                          disabled={savingId === row.id}
                          className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Delete action code"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category reference</CardTitle>
          <CardDescription>
            Internal categories used after action codes are resolved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {EXTRACT_CATEGORIES.filter((c) => c !== "uncategorized").map(
              (c) => (
                <Badge key={c} className={cn(EXTRACT_CATEGORY_STYLES[c])}>
                  {EXTRACT_CATEGORY_LABELS[c]}
                </Badge>
              ),
            )}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
