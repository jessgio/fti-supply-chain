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
import { Select } from "@/components/ui/select";
import { MONTH_LABELS } from "@/lib/sales-forecast/constants";
import { cn, formatNumber } from "@/lib/utils";
import type {
  SopChannelGroup,
  SopForecastPayload,
  SopPendingForecastReason,
  SopPendingForecastSku,
} from "@/types/database";

const REASON_LABEL: Record<SopPendingForecastReason, string> = {
  missing: "Not in catalog",
  inactive: "Inactive",
  unclassified: "Unclassified",
  packaging: "Packaging",
  extract: "Extract",
};

type ProductType = "single" | "bundle";

type Draft = {
  type: ProductType;
  franchiseId: string;
  franchiseName: string;
  rsp: string;
};

function qtySummary(row: SopPendingForecastSku): string {
  return row.months
    .map((month) => `${MONTH_LABELS[month.month - 1]} ${formatNumber(month.qty)}`)
    .join(" · ");
}

function draftFromRow(row: SopPendingForecastSku): Draft {
  return {
    type: row.is_bundle ? "bundle" : "single",
    franchiseId: row.franchise_id ?? "",
    franchiseName: "",
    rsp: row.retail_price != null ? String(row.retail_price) : "",
  };
}

export function PendingSkusCard({
  rows,
  combined,
  readOnly,
  saving,
  onPayload,
  onError,
}: {
  rows: SopPendingForecastSku[];
  combined: boolean;
  readOnly: boolean;
  saving: boolean;
  onPayload: (group: SopChannelGroup, payload: SopForecastPayload) => void;
  onError: (message: string) => void;
}) {
  const [franchises, setFranchises] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;
    void fetch("/api/metadata")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.franchises)) return;
        setFranchises(data.franchises);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rows.length]);

  const rowKey = rows.map((row) => row.id).join(",");
  const initialDrafts = useMemo(() => {
    const next: Record<string, Draft> = {};
    for (const row of rows) next[row.id] = draftFromRow(row);
    return next;
    // Re-seed when the pending set changes, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey]);

  useEffect(() => {
    setDrafts(initialDrafts);
  }, [initialDrafts]);

  if (rows.length === 0) return null;

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? draftFromRow(rows[0]!)), ...patch },
    }));
  }

  async function run(
    id: string,
    fn: () => Promise<Response>,
  ): Promise<void> {
    setBusyId(id);
    onError("");
    try {
      const res = await fn();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const group = data.group as SopChannelGroup | undefined;
      if (group === "online" || group === "offline") {
        onPayload(group, data);
      } else {
        throw new Error("Unexpected response after updating pending SKU.");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusyId(null);
    }
  }

  function addToForecast(row: SopPendingForecastSku) {
    const draft = drafts[row.id] ?? draftFromRow(row);
    const rsp = Number(String(draft.rsp).replace(/,/g, ""));
    void run(row.id, () =>
      fetch(`/api/sales-forecast/pending/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_bundle: draft.type === "bundle",
          franchise_id: draft.type === "single" ? draft.franchiseId || null : null,
          franchise_name:
            draft.type === "single" ? draft.franchiseName.trim() || null : null,
          retail_price: rsp,
        }),
      }),
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-stone-200">
        <CardTitle>Needs review ({rows.length})</CardTitle>
        <CardDescription>
          These SKUs were in the CSV but are missing, inactive, or unclassified.
          Set type, franchise, and RSP, then add them to the main forecast. Known
          SKUs from the same file are already uploaded.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="px-4 py-2.5 font-medium">SKU</th>
                {combined ? (
                  <th className="px-3 py-2.5 font-medium">Channel</th>
                ) : null}
                <th className="px-3 py-2.5 font-medium">Why</th>
                <th className="px-3 py-2.5 font-medium">CSV qty</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Franchise</th>
                <th className="px-3 py-2.5 font-medium">RSP</th>
                <th className="px-4 py-2.5 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.id] ?? draftFromRow(row);
                const busy = busyId === row.id || saving;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-stone-100 align-top last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900">
                        {row.sku_code}
                      </div>
                      {row.name && row.name !== row.sku_code ? (
                        <div className="mt-0.5 text-xs text-stone-500">
                          {row.name}
                        </div>
                      ) : null}
                      {row.suggested_sku_code && !readOnly ? (
                        <button
                          type="button"
                          className="mt-1 text-xs text-emerald-700 hover:underline"
                          disabled={busy}
                          onClick={() =>
                            void run(row.id, () =>
                              fetch(`/api/sales-forecast/pending/${row.id}`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "use_suggestion",
                                }),
                              }),
                            )
                          }
                        >
                          Use {row.suggested_sku_code} instead
                        </button>
                      ) : row.suggested_sku_code ? (
                        <div className="mt-1 text-xs text-stone-500">
                          Did you mean {row.suggested_sku_code}?
                        </div>
                      ) : null}
                    </td>
                    {combined ? (
                      <td className="px-3 py-3 text-xs capitalize text-stone-600">
                        {row.sop_group}
                      </td>
                    ) : null}
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          row.reason === "missing"
                            ? "bg-rose-50 text-rose-800"
                            : row.reason === "inactive"
                              ? "bg-stone-100 text-stone-700"
                              : "bg-amber-50 text-amber-900",
                        )}
                      >
                        {REASON_LABEL[row.reason]}
                      </span>
                    </td>
                    <td className="max-w-[16rem] px-3 py-3 text-xs leading-snug text-stone-600">
                      {qtySummary(row) || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        className="h-8 min-w-[7rem] py-1 text-xs"
                        value={draft.type}
                        disabled={readOnly || busy}
                        onChange={(e) => {
                          const type = e.target.value as ProductType;
                          patchDraft(row.id, {
                            type,
                            ...(type === "bundle"
                              ? { franchiseId: "", franchiseName: "" }
                              : {}),
                          });
                        }}
                      >
                        <option value="single">Single</option>
                        <option value="bundle">Bundle</option>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      {draft.type === "bundle" ? (
                        <span className="text-xs text-stone-400">—</span>
                      ) : (
                        <div className="flex min-w-[12rem] flex-col gap-1">
                          <Select
                            className="h-8 py-1 text-xs"
                            value={draft.franchiseId}
                            disabled={readOnly || busy}
                            onChange={(e) =>
                              patchDraft(row.id, {
                                franchiseId: e.target.value,
                                franchiseName: e.target.value
                                  ? ""
                                  : draft.franchiseName,
                              })
                            }
                          >
                            <option value="">Select…</option>
                            {franchises.map((franchise) => (
                              <option key={franchise.id} value={franchise.id}>
                                {franchise.name}
                              </option>
                            ))}
                          </Select>
                          <Input
                            className="h-8 text-xs"
                            placeholder="Or new franchise"
                            value={draft.franchiseName}
                            disabled={
                              readOnly || busy || Boolean(draft.franchiseId)
                            }
                            onChange={(e) =>
                              patchDraft(row.id, {
                                franchiseName: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        className="h-8 w-28 text-xs"
                        inputMode="decimal"
                        placeholder="RSP"
                        value={draft.rsp}
                        disabled={readOnly || busy}
                        onChange={(e) =>
                          patchDraft(row.id, { rsp: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-stretch gap-1">
                        <Button
                          size="sm"
                          disabled={readOnly || busy}
                          onClick={() => addToForecast(row)}
                        >
                          Add to forecast
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={readOnly || busy}
                          onClick={() =>
                            void run(row.id, () =>
                              fetch(`/api/sales-forecast/pending/${row.id}`, {
                                method: "DELETE",
                              }),
                            )
                          }
                        >
                          Dismiss
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
