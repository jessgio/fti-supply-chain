"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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

interface ItemNameMappingRow {
  id: string;
  manufacturer_name: string;
  extract_id: string;
  item_no: string;
  description: string | null;
}

export default function ExtractMappingsPage() {
  const [actionCodes, setActionCodes] = useState<ExtractActionCodeMapping[]>(
    [],
  );
  const [itemNames, setItemNames] = useState<ItemNameMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newCodeCategory, setNewCodeCategory] =
    useState<ExtractCategory>("production");
  const [newMfrName, setNewMfrName] = useState("");
  const [newItemNo, setNewItemNo] = useState("");

  const loadMappings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [codesRes, namesRes] = await Promise.all([
        fetch("/api/extracts/mappings/action-codes"),
        fetch("/api/extracts/mappings/item-names"),
      ]);
      const codesData = await codesRes.json();
      const namesData = await namesRes.json();
      if (!codesRes.ok) {
        throw new Error(codesData.error ?? "Failed to load action codes");
      }
      if (!namesRes.ok) {
        throw new Error(namesData.error ?? "Failed to load item names");
      }
      setActionCodes(codesData.mappings ?? []);
      setItemNames(namesData.mappings ?? []);
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

  async function addItemName() {
    const manufacturer_name = newMfrName.trim();
    const item_no = newItemNo.trim();
    if (!manufacturer_name || !item_no) return;
    setSavingId("new-item");
    setError(null);
    try {
      const res = await fetch("/api/extracts/mappings/item-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manufacturer_name, item_no }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add mapping");
      setItemNames((prev) => [...prev, data.mapping]);
      setNewMfrName("");
      setNewItemNo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSavingId(null);
    }
  }

  async function updateItemName(
    id: string,
    patch: { manufacturer_name?: string; item_no?: string },
  ) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/extracts/mappings/item-names/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setItemNames((prev) =>
        prev.map((row) => (row.id === id ? data.mapping : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function removeItemName(id: string) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/extracts/mappings/item-names/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setItemNames((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <PageShell wide>
      <div>
        <Link
          href="/dashboard/extracts"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to extracts
        </Link>
        <h1 className="text-2xl font-semibold text-stone-900">
          Extract mappings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Map manufacturer action codes to internal categories, and manufacturer
          item names to FTI extract item numbers. These mappings are used when
          entering movements manually.
        </p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Action codes</CardTitle>
          <CardDescription>
            Manufacturer action codes (e.g. QAC, RNI, SC/HC) map to internal
            movement categories when you enter ledger rows.
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
          <CardTitle>Item names</CardTitle>
          <CardDescription>
            Manufacturer item names map to FTI extract item numbers. Adding a
            mapping creates the extract record if it does not exist yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">
                Manufacturer item name
              </label>
              <Input
                value={newMfrName}
                onChange={(e) => setNewMfrName(e.target.value)}
                placeholder="As shown on manufacturer ledger"
                disabled={savingId === "new-item"}
              />
            </div>
            <div className="min-w-[8rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">
                FTI Item No
              </label>
              <Input
                value={newItemNo}
                onChange={(e) => setNewItemNo(e.target.value)}
                placeholder="e.g. 6045758"
                disabled={savingId === "new-item"}
              />
            </div>
            <Button
              onClick={addItemName}
              disabled={
                !newMfrName.trim() || !newItemNo.trim() || savingId === "new-item"
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-stone-500">Loading item names…</p>
          ) : itemNames.length === 0 ? (
            <p className="text-sm text-stone-500">No item name mappings yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="px-3 py-2 font-medium">
                      Manufacturer item name
                    </th>
                    <th className="px-3 py-2 font-medium">FTI Item No</th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {itemNames.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100">
                      <td className="px-3 py-2">
                        <Input
                          className="h-8"
                          defaultValue={row.manufacturer_name}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (value && value !== row.manufacturer_name) {
                              updateItemName(row.id, {
                                manufacturer_name: value,
                              });
                            }
                          }}
                          disabled={savingId === row.id}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 font-medium"
                          defaultValue={row.item_no}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (value && value !== row.item_no) {
                              updateItemName(row.id, { item_no: value });
                            }
                          }}
                          disabled={savingId === row.id}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeItemName(row.id)}
                          disabled={savingId === row.id}
                          className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Delete item name mapping"
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
