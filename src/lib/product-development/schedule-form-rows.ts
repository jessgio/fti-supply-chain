import { computePdTimeline, type PdDateAnchor } from "@/lib/product-development/gantt";
import {
  formatIsoDate,
  resolveDurationDaysForRow,
} from "@/lib/product-development/duration";
import type { PdPhaseDetail, PdPhaseLink } from "@/types/database";
import type { PhaseFormRow } from "@/components/product-development/pd-phase-table";

export function rowKey(row: PhaseFormRow): string {
  return row.id ?? row.clientId;
}

function buildAliasMap(rows: PhaseFormRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = rowKey(row);
    map.set(key, key);
    map.set(row.clientId, key);
    if (row.id) map.set(row.id, key);
  }
  return map;
}

function rowsToScheduleModel(rows: PhaseFormRow[]): {
  phases: PdPhaseDetail[];
  links: PdPhaseLink[];
} {
  const alias = buildAliasMap(rows);

  const phases: PdPhaseDetail[] = rows.map((row, index) => {
    const durationDays = resolveDurationDaysForRow(row);
    return {
      id: rowKey(row),
      project_id: "",
      name: row.name,
      description: null,
      sort_order: index,
      is_root_task: row.is_root_task,
      parent_phase_id: row.parent_client_id,
      depends_on_phase_id: null,
      start_date: row.start_date,
      end_date: row.end_date,
      duration_days: durationDays,
      duration_text: row.duration_text.trim() || null,
      duration_mode: row.duration_mode,
      actual_end_date: null,
      status: row.status,
      cycle_notes: null,
      created_at: "",
      updated_at: "",
      pics: [],
      components: [],
      files: [],
      depends_on_phase_ids: [],
      parallel_with_phase_ids: [],
    };
  });

  const links: PdPhaseLink[] = [];
  for (const row of rows) {
    const fromId = rowKey(row);
    for (const ref of row.depends_on_phase_ids) {
      const toId = alias.get(ref);
      if (toId && toId !== fromId) {
        links.push({
          id: `${fromId}-${toId}-dep`,
          project_id: "",
          from_phase_id: fromId,
          to_phase_id: toId,
          link_type: "depends_on",
          created_at: "",
        });
      }
    }
    for (const ref of row.parallel_with_phase_ids) {
      const toId = alias.get(ref);
      if (toId && toId !== fromId) {
        links.push({
          id: `${fromId}-${toId}-par`,
          project_id: "",
          from_phase_id: fromId,
          to_phase_id: toId,
          link_type: "parallel_with",
          created_at: "",
        });
      }
    }
  }

  return { phases, links };
}

export function buildScheduleAnchors(
  rows: PhaseFormRow[],
): Map<string, PdDateAnchor> {
  const anchors = new Map<string, PdDateAnchor>();
  for (const row of rows) {
    if (row.date_anchor) {
      anchors.set(rowKey(row), row.date_anchor);
    }
  }
  return anchors;
}

/**
 * Apply dependency / parallel scheduling to form rows in real time.
 * Uses the same engine as the Gantt chart.
 */
export function applyScheduleToRows(rows: PhaseFormRow[]): PhaseFormRow[] {
  if (rows.length === 0) return rows;

  const { phases, links } = rowsToScheduleModel(rows);
  const hasAnchors = rows.some(
    (r) => r.start_date || r.end_date || r.duration_text.trim(),
  );
  if (!hasAnchors && links.length === 0) return rows;

  const timeline = computePdTimeline(phases, links, buildScheduleAnchors(rows));
  const computedByKey = new Map(timeline.map((t) => [t.phase.id, t]));

  const parentIds = new Set(
    rows
      .map((r) => r.parent_client_id)
      .filter((id): id is string => Boolean(id)),
  );

  return rows.map((row) => {
    const computed = computedByKey.get(rowKey(row));
    if (!computed) return row;

    const isParentRow = row.is_parent || parentIds.has(rowKey(row));
    const preserveEndAnchor =
      !isParentRow && row.date_anchor === "end" && row.end_date;
    const preserveStartAnchor =
      !isParentRow && row.date_anchor === "start" && row.start_date;

    const nextStart = preserveStartAnchor
      ? row.start_date
      : computed.computedStart
        ? formatIsoDate(computed.computedStart)
        : row.start_date;
    const nextEnd = preserveEndAnchor
      ? row.end_date
      : computed.computedEnd
        ? formatIsoDate(computed.computedEnd)
        : row.end_date;

    if (nextStart === row.start_date && nextEnd === row.end_date) {
      return row;
    }
    return {
      ...row,
      start_date: nextStart,
      end_date: nextEnd,
      date_anchor: isParentRow ? null : (row.date_anchor ?? null),
    };
  });
}
