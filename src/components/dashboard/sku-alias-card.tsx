"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  SkuSearchInput,
  type SkuSearchOption,
} from "@/components/packaging/sku-search-input";
import type { SkuAliasRecord } from "@/lib/skus/alias-resolve";

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(text.slice(0, 200) || res.statusText);
  }
}

function skuLabel(code: string, name: string | null): string {
  return name && name !== code ? `${code} · ${name}` : code;
}

export function SkuAliasCard() {
  const [options, setOptions] = useState<SkuSearchOption[]>([]);
  const [aliases, setAliases] = useState<SkuAliasRecord[]>([]);
  const [aliasSku, setAliasSku] = useState<SkuSearchOption | null>(null);
  const [canonicalSku, setCanonicalSku] = useState<SkuSearchOption | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [skuRes, aliasRes] = await Promise.all([
          fetch("/api/skus?scope=all"),
          fetch("/api/skus/aliases"),
        ]);
        const skuBody = await readJson(skuRes);
        const aliasBody = await readJson(aliasRes);
        if (!skuRes.ok) {
          throw new Error(String(skuBody.error ?? "Failed to load SKUs"));
        }
        if (!aliasRes.ok) {
          throw new Error(String(aliasBody.error ?? "Failed to load aliases"));
        }
        if (cancelled) return;
        setOptions((skuBody.skus as SkuSearchOption[]) ?? []);
        setAliases((aliasBody.aliases as SkuAliasRecord[]) ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load aliases");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleAliases = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return aliases;
    return aliases.filter((row) => {
      const haystack = [
        row.alias_sku_code,
        row.alias_name ?? "",
        row.canonical_sku_code,
        row.canonical_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [aliases, filter]);

  async function saveAlias() {
    if (!aliasSku || !canonicalSku) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/skus/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias_sku_id: aliasSku.id,
          canonical_sku_id: canonicalSku.id,
        }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(String(body.error ?? "Failed to save alias"));
      setAliases((body.aliases as SkuAliasRecord[]) ?? []);
      const salesMoved = Number(body.sales_moved ?? 0);
      const stockRows = Number(body.stock_rows ?? 0);
      const plansMoved = Number(body.plans_moved ?? 0);
      const changedTarget = Boolean(body.previous_canonical_sku_id);
      const parts = [
        `Aliased ${aliasSku.sku_code} onto ${canonicalSku.sku_code}.`,
        salesMoved > 0
          ? `Moved ${salesMoved.toLocaleString()} sales row${salesMoved === 1 ? "" : "s"}.`
          : null,
        stockRows > 0
          ? `Combined ${stockRows.toLocaleString()} stock row${stockRows === 1 ? "" : "s"}.`
          : null,
        plansMoved > 0
          ? `Moved ${plansMoved.toLocaleString()} forecast plan${plansMoved === 1 ? "" : "s"}.`
          : null,
        changedTarget
          ? "Sales already combined onto the previous SKU stay there."
          : null,
      ].filter(Boolean);
      setStatus(parts.join(" "));
      setAliasSku(null);
      setCanonicalSku(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alias");
    } finally {
      setSaving(false);
    }
  }

  async function removeAlias(row: SkuAliasRecord) {
    const confirmed = window.confirm(
      `Remove the alias from ${row.alias_sku_code} to ${row.canonical_sku_code}? Sales already combined onto ${row.canonical_sku_code} stay there. Later uploads of ${row.alias_sku_code} are stored on that code again.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/skus/aliases?alias_sku_id=${encodeURIComponent(row.alias_sku_id)}`,
        { method: "DELETE" },
      );
      const body = await readJson(res);
      if (!res.ok) throw new Error(String(body.error ?? "Failed to remove alias"));
      setAliases((body.aliases as SkuAliasRecord[]) ?? []);
      setStatus(`Removed the alias for ${row.alias_sku_code}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove alias");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SKU aliases</CardTitle>
        <CardDescription>
          Point a pre-order code at the regular SKU for the same product. Sales,
          stock, on-order quantity, and forecasts then count on the regular SKU.
          The pre-order code stays in the catalog so uploads still match. The
          regular SKU should be the mapped product used in forecast.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-stone-700" htmlFor="alias-sku">
              Pre-order SKU
            </label>
            <SkuSearchInput
              id="alias-sku"
              options={options}
              value={aliasSku}
              onChange={setAliasSku}
              placeholder="Search the stand-in code…"
              disabled={loading || saving}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-stone-700" htmlFor="canonical-sku">
              Regular SKU
            </label>
            <SkuSearchInput
              id="canonical-sku"
              options={options}
              value={canonicalSku}
              onChange={setCanonicalSku}
              placeholder="Search the canonical code…"
              disabled={loading || saving}
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={() => void saveAlias()}
          disabled={loading || saving || !aliasSku || !canonicalSku}
        >
          {saving ? "Saving…" : "Alias onto regular SKU"}
        </Button>

        {loading && <p className="text-sm text-stone-500">Loading aliases…</p>}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="text-sm text-emerald-700" role="status">
            {status}
          </p>
        )}

        {aliases.length > 6 && (
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter aliases…"
            aria-label="Filter aliases"
            className="max-w-xs"
          />
        )}

        {!loading && aliases.length === 0 && (
          <p className="text-sm text-stone-500">No SKU aliases yet.</p>
        )}
        {!loading && aliases.length > 0 && visibleAliases.length === 0 && (
          <p className="text-sm text-stone-500">No aliases match that filter.</p>
        )}
        {visibleAliases.length > 0 && (
          <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200">
            {visibleAliases.map((row) => (
              <li
                key={row.alias_sku_id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <p className="text-sm text-stone-800">
                  <span className="font-medium">{row.alias_sku_code}</span>
                  <span className="text-stone-500"> aliases onto </span>
                  <span className="font-medium">
                    {skuLabel(row.canonical_sku_code, row.canonical_name)}
                  </span>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void removeAlias(row)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
