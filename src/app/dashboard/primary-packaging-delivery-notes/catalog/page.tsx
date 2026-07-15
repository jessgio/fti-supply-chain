"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Plus, Search, Settings, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/dashboard/page-shell";
import type { PrimaryPackagingInboundCosmax } from "@/types/database";

interface DraftRow {
  item_code: string;
  product_name: string;
}

export default function PrimaryPackagingCatalogPage() {
  const [items, setItems] = useState<PrimaryPackagingInboundCosmax[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [newItem, setNewItem] = useState<DraftRow>({ item_code: "", product_name: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/primary-packaging-delivery-notes/catalog?all=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load catalog.");
      const rows = (data.items ?? []) as PrimaryPackagingInboundCosmax[];
      setItems(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            { item_code: row.item_code, product_name: row.product_name },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.item_code.toLowerCase().includes(q) ||
        item.product_name.toLowerCase().includes(q),
    );
  }, [items, search]);

  async function saveRow(id: string) {
    const draft = drafts[id];
    const original = items.find((item) => item.id === id);
    if (!draft || !original) return;

    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/primary-packaging-delivery-notes/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_code: draft.item_code,
          product_name: draft.product_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save item.");
      const updated = data.item as PrimaryPackagingInboundCosmax;
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setDrafts((prev) => ({
        ...prev,
        [id]: { item_code: updated.item_code, product_name: updated.product_name },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(id: string, is_active: boolean) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/primary-packaging-delivery-notes/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update item.");
      const updated = data.item as PrimaryPackagingInboundCosmax;
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/primary-packaging-delivery-notes/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add item.");
      const created = data.item as PrimaryPackagingInboundCosmax;
      setItems((prev) => [...prev, created].sort((a, b) => a.item_code.localeCompare(b.item_code)));
      setDrafts((prev) => ({
        ...prev,
        [created.id]: {
          item_code: created.item_code,
          product_name: created.product_name,
        },
      }));
      setNewItem({ item_code: "", product_name: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCsvUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadStatus(null);
    setImportErrors([]);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch("/api/primary-packaging-delivery-notes/catalog/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setImportErrors(data.errors ?? []);
        throw new Error(data.error ?? "Import failed.");
      }

      const parts = [
        `${data.inserted ?? 0} added`,
        `${data.updated ?? 0} updated`,
      ];
      setUploadStatus(`Imported ${data.total ?? 0} items (${parts.join(", ")}).`);
      setImportErrors(data.errors ?? []);
      setUploadFile(null);
      await load();
    } catch (err) {
      setUploadStatus(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <PageShell className="max-w-5xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">
              Primary Packaging Inbound to Cosmax
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Manage the 12-digit item codes and product names used on primary packaging delivery
              notes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/primary-packaging-delivery-notes">
              <Button type="button" variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Delivery notes
              </Button>
            </Link>
            <Link href="/dashboard/primary-packaging-delivery-notes/settings">
              <Button type="button" variant="outline" size="sm">
                <Settings className="mr-2 h-4 w-4" />
                Cosmax recipient settings
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Import from CSV</CardTitle>
            <CardDescription>
              Upload a CSV with headers <strong>Item No</strong> (12-digit code) and{" "}
              <strong>Description</strong> (product name). Existing codes are updated; new codes
              are added. Excel (.xlsx) is also accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center hover:bg-stone-100">
              <Upload className="mb-2 h-6 w-6 text-stone-500" />
              <span className="text-sm font-medium text-stone-700">
                {uploadFile ? uploadFile.name : "Choose CSV or Excel file"}
              </span>
              <span className="mt-1 text-xs text-stone-500">Item No, Description</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              type="button"
              disabled={!uploadFile || uploading}
              onClick={() => void handleCsvUpload()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import catalog"
              )}
            </Button>
            {uploadStatus && (
              <p className="text-sm text-stone-600" role="status">
                {uploadStatus}
              </p>
            )}
            {importErrors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  {importErrors.length} row{importErrors.length === 1 ? "" : "s"} skipped:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {importErrors.slice(0, 10).map((item) => (
                    <li key={`${item.row}-${item.message}`}>
                      Row {item.row}: {item.message}
                    </li>
                  ))}
                </ul>
                {importErrors.length > 10 && (
                  <p className="mt-2 text-xs">…and {importErrors.length - 10} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add item</CardTitle>
            <CardDescription>
              Item codes must be exactly 12 characters. They appear on the delivery note PDF as
              Kode Barang.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCreate}
              className="grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end"
            >
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-stone-700">12-digit code</span>
                <Input
                  value={newItem.item_code}
                  onChange={(e) =>
                    setNewItem((prev) => ({
                      ...prev,
                      item_code: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="635904002711"
                  maxLength={12}
                  className="font-mono"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-stone-700">Product name</span>
                <Input
                  value={newItem.product_name}
                  onChange={(e) =>
                    setNewItem((prev) => ({ ...prev, product_name: e.target.value }))
                  }
                  placeholder="FTI From This Island … #Bottle"
                  required
                />
              </label>
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catalog</CardTitle>
            <CardDescription>
              {items.length} item{items.length === 1 ? "" : "s"} · inactive items are hidden from
              the delivery note form
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or product name…"
                className="pl-9"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {loading ? (
              <div className="flex items-center text-stone-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading catalog…
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-stone-500">No items found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2 pr-4 font-medium">Code</th>
                      <th className="py-2 pr-4 font-medium">Product name</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const draft = drafts[item.id] ?? {
                        item_code: item.item_code,
                        product_name: item.product_name,
                      };
                      const dirty =
                        draft.item_code !== item.item_code ||
                        draft.product_name !== item.product_name;

                      return (
                        <tr key={item.id} className="border-b border-stone-100 align-top">
                          <td className="py-3 pr-4">
                            <Input
                              value={draft.item_code}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...draft,
                                    item_code: e.target.value.toUpperCase(),
                                  },
                                }))
                              }
                              className="font-mono text-xs"
                              maxLength={12}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <Input
                              value={draft.product_name}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, product_name: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <Badge
                              className={
                                item.is_active
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-stone-100 text-stone-600"
                              }
                            >
                              {item.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!dirty || savingId === item.id}
                                onClick={() => void saveRow(item.id)}
                              >
                                {savingId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={savingId === item.id}
                                onClick={() => void toggleActive(item.id, !item.is_active)}
                              >
                                {item.is_active ? "Deactivate" : "Activate"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
