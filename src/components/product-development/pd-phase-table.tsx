"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhaseRelationsCell } from "@/components/product-development/phase-relations-cell";
import { PdPhaseMindMap } from "@/components/product-development/pd-phase-mindmap";
import { PdScheduleDateField } from "@/components/product-development/pd-schedule-date-field";
import { DEFAULT_PHASE_GROUPS } from "@/lib/product-development/default-phases";
import {
  calcEndDateFromInputs,
  calcStartDateFromInputs,
  inferDurationDaysFromSpan,
  parseDurationText,
  recalculateRowScheduleDates,
  resolveDurationDaysForRow,
} from "@/lib/product-development/duration";
import { applyScheduleToRows } from "@/lib/product-development/schedule-form-rows";
import {
  isNpdConfirmationPhase,
  resolveNpdConfirmationStartDate,
} from "@/lib/product-development/npd-confirmation-schedule";
import { cn } from "@/lib/utils";
import type {
  PdComponentInput,
  PdDurationMode,
  PdPhaseDetail,
  PdPhaseInput,
  PdPhaseStatus,
} from "@/types/database";

export interface PhaseFormRow {
  clientId: string;
  id?: string;
  name: string;
  is_parent: boolean;
  parent_client_id: string | null;
  duration_text: string;
  duration_mode: PdDurationMode;
  start_date: string | null;
  end_date: string | null;
  date_anchor?: "start" | "end" | null;
  depends_on_phase_ids: string[];
  parallel_with_phase_ids: string[];
  sort_order: number;
  is_root_task: boolean;
  status: PdPhaseStatus;
  pic_profile_ids: string[];
  components: PdComponentInput[];
}

function emptyRow(
  overrides: Partial<PhaseFormRow> & Pick<PhaseFormRow, "sort_order">,
): PhaseFormRow {
  return {
    clientId: crypto.randomUUID(),
    name: "",
    is_parent: false,
    parent_client_id: null,
    duration_text: "",
    duration_mode: "working_days",
    start_date: null,
    end_date: null,
    date_anchor: null,
    depends_on_phase_ids: [],
    parallel_with_phase_ids: [],
    is_root_task: false,
    status: "not_started",
    pic_profile_ids: [],
    components: [],
    ...overrides,
  };
}

export function createDefaultPhases(): PhaseFormRow[] {
  const rows: PhaseFormRow[] = [];
  let order = 0;

  for (const group of DEFAULT_PHASE_GROUPS) {
    const parentId = crypto.randomUUID();
    rows.push(
      emptyRow({
        clientId: parentId,
        name: group.name,
        is_parent: true,
        is_root_task: true,
        sort_order: order++,
      }),
    );
    for (const childName of group.children) {
      rows.push(
        emptyRow({
          name: childName,
          is_parent: false,
          parent_client_id: parentId,
          sort_order: order++,
        }),
      );
    }
  }

  return rows;
}

export function phasesToInput(
  rows: PhaseFormRow[],
  options?: { scheduleOnly?: boolean },
): PdPhaseInput[] {
  const scheduleOnly = options?.scheduleOnly ?? false;
  return rows.map((row, index) => {
    const parsed = parseDurationText(row.duration_text);
    const input: PdPhaseInput = {
      id: row.id,
      client_id: row.clientId,
      name: row.name,
      sort_order: index,
      is_root_task: row.is_parent,
      parent_phase_id: row.parent_client_id,
      depends_on_phase_ids: row.depends_on_phase_ids,
      parallel_with_phase_ids: row.parallel_with_phase_ids,
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      duration_text: row.duration_text.trim() || null,
      duration_days: parsed.days,
      duration_mode: row.duration_mode,
      status: row.status,
    };
    if (!scheduleOnly) {
      input.pic_profile_ids = row.pic_profile_ids;
      input.components = row.components;
    }
    return input;
  });
}

export function projectPhasesToFormRows(
  phases: PdPhaseDetail[],
  npdConfirmationStartDate?: string | null,
): PhaseFormRow[] {
  const childParentIds = new Set(
    phases.map((p) => p.parent_phase_id).filter((id): id is string => Boolean(id)),
  );

  const rows = [...phases]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      clientId: p.id,
      id: p.id,
      name: p.name,
      is_parent: p.is_root_task || childParentIds.has(p.id),
      parent_client_id: p.parent_phase_id,
      duration_text: p.duration_text ?? "",
      duration_mode: p.duration_mode ?? "working_days",
      start_date: p.start_date,
      end_date: p.end_date,
      depends_on_phase_ids: p.depends_on_phase_ids ?? [],
      parallel_with_phase_ids: p.parallel_with_phase_ids ?? [],
      sort_order: p.sort_order,
      is_root_task: p.is_root_task,
      status: p.status,
      pic_profile_ids: p.pics.map((pic) => pic.profile_id),
      components: p.components.map((c) => ({
        id: c.id,
        component_type: c.component_type,
        name: c.name,
        description: c.description,
        sort_order: c.sort_order,
      })),
    }));

  return applyScheduleToRows(rows, {
    npdConfirmationStartDate: resolveNpdConfirmationStartDate(
      npdConfirmationStartDate,
    ),
  });
}

function commitRows(
  rows: PhaseFormRow[],
  npdConfirmationStartDate?: string | null,
): PhaseFormRow[] {
  return applyScheduleToRows(rows, {
    npdConfirmationStartDate: resolveNpdConfirmationStartDate(
      npdConfirmationStartDate,
    ),
  });
}

export function clearAllDurations(rows: PhaseFormRow[]): PhaseFormRow[] {
  return rows.map((row) => ({ ...row, duration_text: "" }));
}

export function clearAllStartDates(rows: PhaseFormRow[]): PhaseFormRow[] {
  return rows.map((row) => ({
    ...row,
    start_date: null,
    end_date: null,
    date_anchor: null,
  }));
}

export function clearAllLinks(rows: PhaseFormRow[]): PhaseFormRow[] {
  return rows.map((row) => ({
    ...row,
    depends_on_phase_ids: [],
    parallel_with_phase_ids: [],
  }));
}

function collectAffectedClientIds(
  before: PhaseFormRow[],
  after: PhaseFormRow[],
  sourceClientId: string,
): Set<string> {
  const beforeByClientId = new Map(before.map((r) => [r.clientId, r]));
  const affected = new Set<string>([sourceClientId]);

  for (const row of after) {
    const prev = beforeByClientId.get(row.clientId);
    if (!prev) continue;
    if (
      prev.start_date !== row.start_date ||
      prev.end_date !== row.end_date
    ) {
      affected.add(row.clientId);
    }
  }

  return affected;
}

function childInsertIndex(rows: PhaseFormRow[], parentClientId: string): number {
  const parentIndex = rows.findIndex((r) => r.clientId === parentClientId);
  if (parentIndex === -1) return rows.length;
  let i = parentIndex + 1;
  while (i < rows.length && rows[i].parent_client_id === parentClientId) {
    i += 1;
  }
  return i;
}

function reindex(rows: PhaseFormRow[]): PhaseFormRow[] {
  return rows.map((row, index) => ({ ...row, sort_order: index }));
}

function stripRefs(rows: PhaseFormRow[], removedId: string): PhaseFormRow[] {
  return rows.map((row) => ({
    ...row,
    depends_on_phase_ids: row.depends_on_phase_ids.filter((id) => id !== removedId),
    parallel_with_phase_ids: row.parallel_with_phase_ids.filter(
      (id) => id !== removedId,
    ),
  }));
}

const DURATION_MODE_OPTIONS: Array<{
  value: PdDurationMode;
  line1: string;
  line2: string;
  title: string;
}> = [
  {
    value: "working_days",
    line1: "Working",
    line2: "days",
    title: "Working days (Mon–Fri only)",
  },
  {
    value: "effective_days",
    line1: "Effective",
    line2: "days",
    title: "Effective days (all calendar days)",
  },
];

function DurationModePicker({
  value,
  onChange,
}: {
  value: PdDurationMode;
  onChange: (mode: PdDurationMode) => void;
}) {
  return (
    <div className="flex min-w-[5.5rem] flex-col gap-0.5" role="radiogroup">
      {DURATION_MODE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2 py-1 text-left leading-tight transition-colors",
            value === opt.value
              ? "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-600/35"
              : "text-stone-600 hover:bg-stone-100",
          )}
        >
          <span className="block text-[11px] font-medium">{opt.line1}</span>
          <span
            className={cn(
              "block text-[10px]",
              value === opt.value ? "text-emerald-800/80" : "text-stone-500",
            )}
          >
            {opt.line2}
          </span>
        </button>
      ))}
    </div>
  );
}

interface PdPhaseTableProps {
  phases: PhaseFormRow[];
  onChange: (phases: PhaseFormRow[]) => void;
  showBulkClearActions?: boolean;
  /** When set, locks NPD Confirmation start to the approved formula tracker date. */
  npdConfirmationStartDate?: string | null;
}

export function PdPhaseTable({
  phases,
  onChange,
  showBulkClearActions = false,
  npdConfirmationStartDate,
}: PdPhaseTableProps) {
  const npdLockedStart = resolveNpdConfirmationStartDate(npdConfirmationStartDate);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const highlightedIdsRef = useRef(highlightedIds);
  const skipNextDismissRef = useRef(false);

  highlightedIdsRef.current = highlightedIds;

  useEffect(() => {
    function dismissHighlight() {
      if (skipNextDismissRef.current) return;
      if (highlightedIdsRef.current.size > 0) {
        setHighlightedIds(new Set());
      }
    }

    document.addEventListener("mousedown", dismissHighlight);
    return () => document.removeEventListener("mousedown", dismissHighlight);
  }, []);

  function flashAffected(before: PhaseFormRow[], after: PhaseFormRow[], sourceClientId: string) {
    const affected = collectAffectedClientIds(before, after, sourceClientId);
    skipNextDismissRef.current = true;
    setHighlightedIds(affected);
    requestAnimationFrame(() => {
      skipNextDismissRef.current = false;
    });
  }

  function commit(next: PhaseFormRow[], options?: { highlightSourceId?: string }) {
    const scheduled = commitRows(next, npdConfirmationStartDate);
    if (options?.highlightSourceId) {
      flashAffected(phases, scheduled, options.highlightSourceId);
    }
    onChange(scheduled);
  }

  function updateRow(
    clientId: string,
    patch: Partial<PhaseFormRow>,
    options?: { highlight?: boolean },
  ) {
    const next = phases.map((row) =>
      row.clientId === clientId ? { ...row, ...patch } : row,
    );
    commit(next, options?.highlight ? { highlightSourceId: clientId } : undefined);
  }

  function deleteRow(clientId: string) {
    const row = phases.find((r) => r.clientId === clientId);
    if (!row) return;
    const removedIds = new Set([clientId, row.id].filter(Boolean) as string[]);

    let next = phases;
    if (row.is_parent) {
      next = phases.filter(
        (r) =>
          r.clientId !== clientId &&
          r.parent_client_id !== clientId &&
          !removedIds.has(r.id ?? ""),
      );
    } else {
      next = phases.filter((r) => r.clientId !== clientId);
    }

    for (const id of removedIds) {
      next = stripRefs(next, id);
    }
    commit(reindex(next));
  }

  function addParent() {
    commit(
      reindex([
        ...phases,
        emptyRow({
          name: "New phase",
          is_parent: true,
          is_root_task: true,
          sort_order: phases.length,
        }),
      ]),
    );
  }

  function addChild(parentClientId: string) {
    const index = childInsertIndex(phases, parentClientId);
    const next = [...phases];
    next.splice(
      index,
      0,
      emptyRow({
        name: "",
        parent_client_id: parentClientId,
        sort_order: index,
      }),
    );
    commit(reindex(next));
  }

  const taskOptions = phases
    .filter((r) => r.name.trim())
    .map((r) => ({
      id: r.id ?? r.clientId,
      label: r.is_parent ? r.name : `↳ ${r.name}`,
    }));

  function bulkClear(
    label: string,
    transform: (rows: PhaseFormRow[]) => PhaseFormRow[],
  ) {
    if (!confirm(`Clear ${label} for all tasks? This cannot be undone until you save.`)) {
      return;
    }
    commit(transform(phases));
  }

  return (
    <div className="space-y-3">
      {showBulkClearActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
          <span className="text-xs font-medium text-stone-600">Reset schedule:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => bulkClear("all durations", clearAllDurations)}
          >
            Clear all durations
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (
                !confirm(
                  "Clear all start and finish dates for every task? Clear links too if you want dates to stay empty.",
                )
              ) {
                return;
              }
              onChange(clearAllStartDates(phases));
            }}
          >
            Clear all start dates
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => bulkClear("all links", clearAllLinks)}
          >
            Clear all links
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full min-w-[68rem] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              <th className="w-10 px-3 py-2.5">#</th>
              <th className="min-w-[14rem] px-3 py-2.5">Task name</th>
              <th className="min-w-[7.5rem] px-3 py-2.5">Duration</th>
              <th className="min-w-[5.75rem] px-2 py-2.5 leading-tight">
                <span className="block">Day</span>
                <span className="block">type</span>
              </th>
              <th className="min-w-[6.75rem] px-3 py-2.5">Start</th>
              <th className="min-w-[6.75rem] px-3 py-2.5">Finish</th>
              <th className="min-w-[10rem] px-3 py-2.5">Links</th>
              <th className="w-20 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {phases.map((row, index) => {
              const hasIncomingDeps = row.depends_on_phase_ids.length > 0;
              const hasParallelLinks = row.parallel_with_phase_ids.length > 0;
              const hasScheduleLinks = hasIncomingDeps || hasParallelLinks;
              const durationDays = resolveDurationDaysForRow(row);
              const startReadOnly =
                row.is_parent ||
                row.date_anchor === "end" ||
                (hasIncomingDeps && row.date_anchor !== "start") ||
                (Boolean(npdLockedStart) && isNpdConfirmationPhase(row.name));
              const finishReadOnly = row.is_parent;
              return (
              <tr
                key={row.clientId}
                className={cn(
                  "border-b border-stone-100 last:border-0 transition-colors duration-500",
                  highlightedIds.has(row.clientId)
                    ? "bg-amber-100 ring-2 ring-inset ring-amber-400/70"
                    : row.is_parent
                      ? "bg-stone-50/80"
                      : "bg-white",
                )}
              >
                <td className="px-3 py-1.5 tabular-nums text-stone-400">
                  {index + 1}
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={row.name}
                    onChange={(e) =>
                      updateRow(row.clientId, { name: e.target.value })
                    }
                    placeholder={row.is_parent ? "Phase name" : "Task name"}
                    className={cn(
                      "h-8 border-transparent bg-transparent shadow-none focus:border-stone-300 focus:bg-white",
                      row.is_parent && "font-semibold",
                      !row.is_parent && "ml-4",
                    )}
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <Input
                    value={row.duration_text}
                    onChange={(e) => {
                      const text = e.target.value;
                      const parsed = parseDurationText(text);
                      const nextRow = {
                        ...row,
                        duration_text: text,
                        ...(parsed.impliesEffective
                          ? { duration_mode: "effective_days" as const }
                          : {}),
                      };
                      updateRow(
                        row.clientId,
                        {
                          duration_text: text,
                          ...(parsed.impliesEffective
                            ? { duration_mode: "effective_days" as const }
                            : {}),
                          ...recalculateRowScheduleDates(nextRow),
                        },
                        { highlight: true },
                      );
                    }}
                    placeholder="14 days"
                    className="h-8 min-w-[6.5rem] border-transparent bg-transparent px-2 text-xs shadow-none focus:border-stone-300 focus:bg-white"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <DurationModePicker
                    value={row.duration_mode}
                    onChange={(mode) => {
                      const nextRow = { ...row, duration_mode: mode };
                      updateRow(
                        row.clientId,
                        {
                          duration_mode: mode,
                          ...recalculateRowScheduleDates(nextRow),
                        },
                        { highlight: true },
                      );
                    }}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <PdScheduleDateField
                    value={row.start_date}
                    readOnly={startReadOnly}
                    onChange={(iso) => {
                      const patch: Partial<PhaseFormRow> = {
                        start_date: iso,
                        date_anchor: iso
                          ? "start"
                          : row.date_anchor === "start"
                            ? null
                            : row.date_anchor,
                      };
                      if (iso && durationDays) {
                        const newEnd = calcEndDateFromInputs(
                          iso,
                          row.duration_text,
                          durationDays,
                          row.duration_mode,
                        );
                        if (newEnd) patch.end_date = newEnd;
                      }
                      updateRow(row.clientId, patch, { highlight: true });
                    }}
                    title={
                      npdLockedStart && isNpdConfirmationPhase(row.name)
                        ? "Start date from approved Formula Tracker confirmation"
                        : row.is_parent
                          ? "Calculated from child task dates"
                          : startReadOnly
                            ? "Calculated from dependencies, parallel links, or finish anchor"
                            : "Set anchor start date — finish updates from duration"
                    }
                  />
                </td>
                <td className="px-3 py-1.5">
                  <PdScheduleDateField
                    value={row.end_date}
                    readOnly={finishReadOnly}
                    onChange={(iso) => {
                      const patch: Partial<PhaseFormRow> = {
                        end_date: iso,
                        date_anchor: iso
                          ? "end"
                          : row.date_anchor === "end"
                            ? null
                            : row.date_anchor,
                      };
                      let durationText = row.duration_text;
                      if (iso && !durationDays && row.start_date) {
                        const implied = inferDurationDaysFromSpan(
                          row.start_date,
                          iso,
                          row.duration_mode,
                        );
                        if (implied) {
                          durationText = `${implied} days`;
                          patch.duration_text = durationText;
                        }
                      }
                      const effectiveDays =
                        durationDays ??
                        parseDurationText(durationText).days ??
                        (iso && row.start_date
                          ? inferDurationDaysFromSpan(
                              row.start_date,
                              iso,
                              row.duration_mode,
                            )
                          : null);
                      if (iso && effectiveDays) {
                        const newStart = calcStartDateFromInputs(
                          iso,
                          durationText,
                          effectiveDays,
                          row.duration_mode,
                        );
                        if (newStart) patch.start_date = newStart;
                      }
                      updateRow(row.clientId, patch, { highlight: true });
                    }}
                    title={
                      row.is_parent
                        ? "Calculated from child task dates"
                        : finishReadOnly
                          ? "Calculated from start date and duration"
                          : !durationDays && !row.start_date
                            ? "Set anchor finish — add a duration to back-calculate start"
                            : !durationDays
                              ? "Set finish — duration inferred from start"
                              : hasScheduleLinks
                                ? "Set anchor finish — start moves back by duration and links"
                                : "Set anchor finish — start updates from duration"
                    }
                  />
                </td>
                <td className="px-3 py-1.5">
                  <PhaseRelationsCell
                    selfId={row.id ?? row.clientId}
                    dependsOnIds={row.depends_on_phase_ids}
                    parallelWithIds={row.parallel_with_phase_ids}
                    options={taskOptions}
                    onChange={({ dependsOnIds, parallelWithIds }) =>
                      updateRow(
                        row.clientId,
                        {
                          depends_on_phase_ids: dependsOnIds,
                          parallel_with_phase_ids: parallelWithIds,
                        },
                        { highlight: true },
                      )
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-0.5">
                    {row.is_parent && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="Add child task"
                        onClick={() => addChild(row.clientId)}
                        className="h-7 w-7 p-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      title="Delete row"
                      onClick={() => deleteRow(row.clientId)}
                      className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stone-500">
        <strong>Links:</strong> search by task name, then check multiple dependencies
        and parallel tasks. Set a <strong>start</strong> or <strong>finish</strong> date
        (with duration) to anchor a task — the other date and linked tasks update
        automatically.
      </p>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-stone-900">
          Relationship map
        </h3>
        <PdPhaseMindMap phases={phases} onChange={(next) => commit(next)} />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addParent}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add parent phase
      </Button>
    </div>
  );
}
