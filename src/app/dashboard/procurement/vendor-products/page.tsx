"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { VendorProductMapping } from "@/types/database";

export default function VendorProductsPage() {
  const [mappings, setMappings] = useState<VendorProductMapping[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/vendor-products");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const rows = (data.mappings ?? []) as VendorProductMapping[];
      setMappings(rows);
      setDraft(
        Object.fromEntries(
          rows.map((r) => [r.sku_id, r.vendor_product_name ?? ""]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter(
      (m) =>
        m.sku_code.toLowerCase().includes(q) ||
        (m.sku_name?.toLowerCase().includes(q) ?? false) ||
        (draft[m.sku_id]?.toLowerCase().includes(q) ?? false) ||
        (m.vendor_product_name?.toLowerCase().includes(q) ?? false),
    );
  }, [mappings, search, draft]);

  const changedCount = useMemo(
    () =>
      mappings.filter((m) => {
        const current = (draft[m.sku_id] ?? "").trim();
        const original = (m.vendor_product_name ?? "").trim();
        return current !== original;
      }).length,
    [mappings, draft],
  );

  const mappedCount = useMemo(
    () => mappings.filter((m) => (draft[m.sku_id] ?? "").trim()).length,
    [mappings, draft],
  );

  async function handleSave() {
    const updates = mappings
      .filter((m) => {
        const current = (draft[m.sku_id] ?? "").trim();
        const original = (m.vendor_product_name ?? "").trim();
        return current !== original;
      })
      .map((m) => ({
        sku_id: m.sku_id,
        vendor_product_name: draft[m.sku_id]?.trim() || null,
      }));

    if (updates.length === 0) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/procurement/vendor-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      const rows = (data.mappings ?? []) as VendorProductMapping[];
      setMappings(rows);
      setDraft(
        Object.fromEntries(
          rows.map((r) => [r.sku_id, r.vendor_product_name ?? ""]),
        ),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/dashboard/procurement"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to procurement
          </Link>
          <h1 className="text-2xl font-semibold text-stone-900">
            Vendor product names
          </h1>
          <p className="mt-1 text-stone-600">
            Map internal SKUs to the product names your suppliers use. PO PDFs
            show the vendor name instead of the SKU code.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || changedCount === 0}>
          <Save className="h-4 w-4" />
          {saving
            ? "Saving..."
            : changedCount > 0
              ? `Save ${changedCount} change${changedCount === 1 ? "" : "s"}`
              : "Save"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-stone-500">Mapped SKUs</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {mappedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-stone-500">Unsaved changes</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {changedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>SKU mappings</CardTitle>
              <CardDescription>
                {filtered.length} of {mappings.length} SKUs
              </CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-9"
                placeholder="Search SKU or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-stone-500">No SKUs match your search.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4">SKU</th>
                    <th className="py-2 pr-4">Internal name</th>
                    <th className="py-2">Vendor product name</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.sku_id} className="border-b border-stone-100">
                      <td className="py-2.5 pr-4 font-medium text-stone-900">
                        {row.sku_code}
                      </td>
                      <td className="py-2.5 pr-4 text-stone-600">
                        {row.sku_name ?? "—"}
                      </td>
                      <td className="py-2.5">
                        <AutoResizeTextarea
                          value={draft[row.sku_id] ?? ""}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [row.sku_id]: e.target.value,
                            }))
                          }
                          placeholder="Name the vendor recognizes"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {saved && !error && (
            <p className="mt-4 text-sm text-emerald-700">Changes saved.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="min-h-10 w-full resize-none overflow-hidden break-words rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
    />
  );
}
