"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MONTH_LABELS, MONTHS } from "@/lib/sales-forecast/constants";
import { cn, formatCurrency } from "@/lib/utils";
import type { SopChannelGroup, SopYearForecast } from "@/types/database";
import type { DraftsStore } from "./drafts-store";
import { storeServerSnapshot } from "./drafts-store";
import {
  annualFromMonths,
  buildLiveGroupMonths,
  formatSharePct,
  type GroupDrafts,
} from "./view-helpers";

type Workspace = SopChannelGroup | "combined";

/** Local-state input so typing does not rebuild the whole targets card. */
function TargetMonthInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <Input
      className="h-8 px-2 text-xs"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
    />
  );
}

export function TargetsCard({
  store,
  yearData,
  draftsRef,
  workspace,
  readOnly,
  saving,
  combined,
  targetDrafts,
  setTargetDrafts,
  onSave,
}: {
  store: DraftsStore;
  yearData: SopYearForecast | null;
  draftsRef: MutableRefObject<Record<SopChannelGroup, GroupDrafts>>;
  workspace: Workspace;
  readOnly: boolean;
  saving: boolean;
  combined: boolean;
  targetDrafts: Record<SopChannelGroup, Record<number, string>>;
  setTargetDrafts: Dispatch<
    SetStateAction<Record<SopChannelGroup, Record<number, string>>>
  >;
  onSave: () => void;
}) {
  const version = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    storeServerSnapshot,
  );

  const liveGroupMonths = useMemo(() => {
    if (!yearData) {
      const empty = MONTHS.map((month) => ({
        month,
        target: 0,
        planned: 0,
        gap: 0,
        editable: false,
      }));
      return { online: empty, offline: empty, combined: empty };
    }
    return buildLiveGroupMonths(yearData, targetDrafts, draftsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData, targetDrafts, version]);

  const activeGroup: SopChannelGroup | null =
    workspace === "online" || workspace === "offline" ? workspace : null;
  const dirtyTargets =
    yearData && activeGroup
      ? yearData.groups[activeGroup].targets.filter((t) => {
          const next = Number(targetDrafts[activeGroup][t.month] ?? 0);
          return next !== t.target_net_sales_post_tax;
        })
      : [];

  const targetRows = [
    {
      key: "online" as const,
      label: "Online",
      months: liveGroupMonths.online,
      editable: activeGroup === "online" && !readOnly,
      group: "online" as SopChannelGroup,
    },
    {
      key: "offline" as const,
      label: "Offline",
      months: liveGroupMonths.offline,
      editable: activeGroup === "offline" && !readOnly,
      group: "offline" as SopChannelGroup,
    },
    {
      key: "combined" as const,
      label: "Combined",
      months: liveGroupMonths.combined,
      editable: false,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Monthly & annual targets (post-tax IDR)</CardTitle>
          <CardDescription>
            Annual target is the sum of monthly targets. Percentages are each
            month&apos;s share of that annual target. Highlighted when entered
            values are short of the annual target.
          </CardDescription>
        </div>
        <Button
          size="sm"
          disabled={!yearData || readOnly || saving || combined || dirtyTargets.length === 0}
          onClick={onSave}
        >
          <Save className="h-4 w-4" />
          Save targets
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {yearData ? (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {targetRows.map((row) => {
                const annual = annualFromMonths(row.months);
                return (
                  <div
                    key={`${row.key}-annual`}
                    className={cn(
                      "rounded-lg border px-3 py-2.5",
                      row.key === workspace ? "border-emerald-200" : "border-stone-200",
                      annual.short && "border-amber-300 bg-amber-50",
                    )}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                      {row.label} annual
                    </p>
                    <p className="mt-1 text-sm font-medium text-stone-900">
                      Target {formatCurrency(annual.target)}
                    </p>
                    <p className="text-xs text-stone-600">
                      Entered {formatCurrency(annual.planned)}
                      {annual.target > 0
                        ? ` · ${formatSharePct(annual.planned, annual.target)} of annual`
                        : ""}
                    </p>
                    {annual.target <= 0 ? (
                      <p className="mt-1 text-[11px] text-stone-500">
                        Enter monthly targets to set the annual figure.
                      </p>
                    ) : annual.short ? (
                      <p className="mt-1 text-[11px] font-medium text-amber-900">
                        Short {formatCurrency(annual.target - annual.planned)} of
                        annual target
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] font-medium text-emerald-800">
                        {annual.gap === 0
                          ? "Meets annual target"
                          : `Ahead ${formatCurrency(annual.gap)}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <table className="w-full min-w-[80rem] text-left text-sm">
              <thead>
                <tr className="text-stone-500">
                  <th className="py-2 pr-3 font-medium">Team</th>
                  {MONTHS.map((month) => (
                    <th key={month} className="py-2 pr-3 font-medium">
                      {MONTH_LABELS[month - 1]}
                    </th>
                  ))}
                  <th className="py-2 pl-3 font-medium">Annual</th>
                </tr>
              </thead>
              <tbody>
                {targetRows.map((row) => {
                  const annual = annualFromMonths(row.months);
                  return (
                    <tr
                      key={row.key}
                      className={
                        row.key === workspace
                          ? "bg-emerald-50/70"
                          : row.key === "combined"
                            ? "border-t border-stone-200 bg-stone-50/80"
                            : undefined
                      }
                    >
                      <td className="py-2 pr-3 align-top text-xs font-medium uppercase tracking-wide text-stone-600">
                        {row.label}
                      </td>
                      {MONTHS.map((month) => {
                        const cell = row.months[month - 1];
                        return (
                          <td key={month} className="py-1 pr-3 align-top">
                            {row.editable && row.group ? (
                              <TargetMonthInput
                                value={targetDrafts[row.group][month] ?? "0"}
                                onCommit={(value) => {
                                  const group = row.group!;
                                  setTargetDrafts((d) => ({
                                    ...d,
                                    [group]: {
                                      ...d[group],
                                      [month]: value,
                                    },
                                  }));
                                }}
                              />
                            ) : (
                              <p className="h-8 px-2 text-xs leading-8 text-stone-800">
                                {formatCurrency(cell?.target ?? 0)}
                              </p>
                            )}
                            <p className="mt-0.5 text-[11px] text-stone-500">
                              Target {formatSharePct(cell?.target ?? 0, annual.target)} of annual
                            </p>
                            <p className="mt-1 text-[11px] text-stone-500">
                              {cell?.editable ? "Entered" : "Actual"}{" "}
                              {formatCurrency(cell?.planned ?? 0)}
                            </p>
                            <p className="text-[11px] text-stone-500">
                              {cell?.editable ? "Entered" : "Actual"}{" "}
                              {formatSharePct(cell?.planned ?? 0, annual.target)} of
                              annual
                            </p>
                            <p
                              className={`text-[11px] ${
                                (cell?.gap ?? 0) < 0
                                  ? "text-rose-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              Gap {formatCurrency(cell?.gap ?? 0)}
                            </p>
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "py-1 pl-3 align-top",
                          annual.short && "bg-amber-100/80",
                        )}
                      >
                        <p className="h-8 px-2 text-xs leading-8 font-medium text-stone-900">
                          {formatCurrency(annual.target)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          Sum of monthly targets
                        </p>
                        <p className="mt-1 text-[11px] text-stone-600">
                          Entered {formatCurrency(annual.planned)}
                        </p>
                        <p
                          className={cn(
                            "text-[11px] font-medium",
                            annual.short ? "text-amber-900" : "text-emerald-800",
                          )}
                        >
                          {annual.target > 0
                            ? `${formatSharePct(annual.planned, annual.target)} of annual`
                            : "—"}
                        </p>
                        <p
                          className={`text-[11px] ${
                            annual.gap < 0 ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          {annual.short
                            ? `Short ${formatCurrency(annual.target - annual.planned)}`
                            : `Gap ${formatCurrency(annual.gap)}`}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-sm text-stone-500">Loading…</p>
        )}
      </CardContent>
    </Card>
  );
}
