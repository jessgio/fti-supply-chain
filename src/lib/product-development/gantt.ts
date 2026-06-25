import {
  addCalendarDays,
  calculateEndDate,
  calculateStartDate,
  formatIsoDate,
  inferDurationDaysFromSpan,
  parseDate,
  parseDurationText,
} from "@/lib/product-development/duration";
import type {
  PdDurationMode,
  PdGanttBar,
  PdPhaseDetail,
  PdPhaseLink,
  PdPhaseStatus,
} from "@/types/database";

interface ComputedPhase {
  phase: PdPhaseDetail;
  computedStart: Date | null;
  computedEnd: Date | null;
  isShifted: boolean;
}

export type PdDateAnchor = "start" | "end";

function minStartFromDeps(
  phaseId: string,
  ends: Map<string, Date | null>,
  dependsOn: Map<string, string[]>,
): Date | null {
  let candidate: Date | null = null;
  for (const depId of dependsOn.get(phaseId) ?? []) {
    const depEnd = ends.get(depId);
    if (depEnd) {
      const required = addCalendarDays(depEnd, 1);
      if (!candidate || required > candidate) candidate = required;
    }
  }
  return candidate;
}

function resolvePhaseSchedule(
  phase: PdPhaseDetail,
  anchor: PdDateAnchor | undefined,
  manualStart: Date | null,
  manualEnd: Date | null,
  minStart: Date | null,
  hasDependencies: boolean,
  successorConstraintEnd: Date | null,
): { start: Date | null; end: Date | null } {
  const days = resolveDurationDays(phase);
  const mode: PdDurationMode = phase.duration_mode ?? "working_days";

  if (anchor === "end" && manualEnd) {
    if (days) {
      const start = calculateStartDate(manualEnd, days, mode);
      return { start, end: manualEnd };
    }
    return { start: manualStart, end: manualEnd };
  }

  if (anchor === "start" && manualStart) {
    const end = days ? calculateEndDate(manualStart, days, mode) : manualEnd;
    return { start: manualStart, end };
  }

  // Predecessors with dependents track their successors' starts.
  if (
    successorConstraintEnd &&
    anchor !== "start" &&
    anchor !== "end"
  ) {
    const newEnd = successorConstraintEnd;
    const newStart = days ? calculateStartDate(newEnd, days, mode) : newEnd;
    return { start: newStart, end: newEnd };
  }

  // Dependency-driven tasks (no explicit anchor) follow predecessor finishes.
  if (hasDependencies && minStart) {
    const end = days ? calculateEndDate(minStart, days, mode) : manualEnd;
    return { start: minStart, end };
  }

  let start = manualStart;
  if (minStart && (!start || start < minStart)) {
    start = minStart;
  } else if (!start && minStart) {
    start = minStart;
  }

  if (!start) {
    return { start: null, end: manualEnd };
  }

  const end = days ? calculateEndDate(start, days, mode) : manualEnd;
  return { start, end };
}

function buildLinkMaps(links: PdPhaseLink[]) {
  const dependsOn = new Map<string, string[]>();
  const parallelWith = new Map<string, string[]>();

  for (const link of links) {
    if (link.link_type === "depends_on") {
      const list = dependsOn.get(link.from_phase_id) ?? [];
      list.push(link.to_phase_id);
      dependsOn.set(link.from_phase_id, list);
    } else {
      const fromList = parallelWith.get(link.from_phase_id) ?? [];
      fromList.push(link.to_phase_id);
      parallelWith.set(link.from_phase_id, fromList);
      const toList = parallelWith.get(link.to_phase_id) ?? [];
      toList.push(link.from_phase_id);
      parallelWith.set(link.to_phase_id, toList);
    }
  }

  return { dependsOn, parallelWith };
}

/** For each predecessor, lists tasks that depend on it. */
function buildSuccessorsByPredecessor(
  dependsOn: Map<string, string[]>,
): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  for (const [fromId, predIds] of dependsOn) {
    for (const predId of predIds) {
      const list = successors.get(predId) ?? [];
      list.push(fromId);
      successors.set(predId, list);
    }
  }
  return successors;
}

/**
 * Latest date a predecessor may finish so every dependent successor can still
 * start on its computed start (successor start minus one calendar day).
 */
function latestAllowedEndFromSuccessors(
  predecessorId: string,
  starts: Map<string, Date | null>,
  successorsByPred: Map<string, string[]>,
): Date | null {
  let latestEnd: Date | null = null;
  for (const succId of successorsByPred.get(predecessorId) ?? []) {
    const succStart = starts.get(succId);
    if (!succStart) continue;
    const mustFinishBy = addCalendarDays(succStart, -1);
    if (!latestEnd || mustFinishBy < latestEnd) {
      latestEnd = mustFinishBy;
    }
  }
  return latestEnd;
}

function parallelClusters(
  phaseIds: string[],
  parallelWith: Map<string, string[]>,
): string[][] {
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const id of phaseIds) {
    if (visited.has(id)) continue;
    const stack = [id];
    const cluster: string[] = [];
    visited.add(id);

    while (stack.length > 0) {
      const current = stack.pop()!;
      cluster.push(current);
      for (const neighbor of parallelWith.get(current) ?? []) {
        if (!visited.has(neighbor) && phaseIds.includes(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    if (cluster.length > 1) clusters.push(cluster);
  }

  return clusters;
}

function resolveDurationDays(phase: PdPhaseDetail): number | null {
  if (phase.duration_days != null && phase.duration_days > 0) {
    return phase.duration_days;
  }
  const parsed = parseDurationText(phase.duration_text ?? "");
  if (parsed.days) return parsed.days;
  if (phase.start_date && phase.end_date) {
    return inferDurationDaysFromSpan(
      phase.start_date,
      phase.end_date,
      phase.duration_mode ?? "working_days",
    );
  }
  return null;
}

/** Parent phases span their children: earliest start through latest finish. */
function rollupParentDates(
  phases: PdPhaseDetail[],
  starts: Map<string, Date | null>,
  ends: Map<string, Date | null>,
): boolean {
  const childrenByParent = new Map<string, string[]>();
  for (const phase of phases) {
    if (!phase.parent_phase_id) continue;
    const list = childrenByParent.get(phase.parent_phase_id) ?? [];
    list.push(phase.id);
    childrenByParent.set(phase.parent_phase_id, list);
  }

  const parentsWithChildren = phases
    .filter((p) => (childrenByParent.get(p.id)?.length ?? 0) > 0)
    .sort((a, b) => b.sort_order - a.sort_order);

  let changed = false;
  for (const parent of parentsWithChildren) {
    const childIds = childrenByParent.get(parent.id) ?? [];
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;

    for (const childId of childIds) {
      const childStart = starts.get(childId);
      const childEnd = ends.get(childId);
      if (childStart && (!minStart || childStart < minStart)) minStart = childStart;
      if (childEnd && (!maxEnd || childEnd > maxEnd)) maxEnd = childEnd;
    }

    if (minStart && minStart.getTime() !== starts.get(parent.id)?.getTime()) {
      starts.set(parent.id, minStart);
      changed = true;
    }
    if (maxEnd && maxEnd.getTime() !== ends.get(parent.id)?.getTime()) {
      ends.set(parent.id, maxEnd);
      changed = true;
    }
  }
  return changed;
}

function reapplyEndAnchors(
  phases: PdPhaseDetail[],
  anchors: Map<string, PdDateAnchor>,
  manualEnds: Map<string, Date | null>,
  starts: Map<string, Date | null>,
  ends: Map<string, Date | null>,
): boolean {
  let changed = false;
  for (const phase of phases) {
    if (anchors.get(phase.id) !== "end") continue;
    const manualEnd = manualEnds.get(phase.id);
    const days = resolveDurationDays(phase);
    if (!manualEnd || !days) continue;
    const mode: PdDurationMode = phase.duration_mode ?? "working_days";
    const start = calculateStartDate(manualEnd, days, mode);
    if (start.getTime() !== starts.get(phase.id)?.getTime()) {
      starts.set(phase.id, start);
      changed = true;
    }
    if (manualEnd.getTime() !== ends.get(phase.id)?.getTime()) {
      ends.set(phase.id, manualEnd);
      changed = true;
    }
  }
  return changed;
}

/**
 * Parallel tasks share the same start; dependencies push starts forward.
 */
export function computePdTimeline(
  phases: PdPhaseDetail[],
  links: PdPhaseLink[] = [],
  anchors: Map<string, PdDateAnchor> = new Map(),
): ComputedPhase[] {
  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  const phaseIds = sorted.map((p) => p.id);
  const { dependsOn, parallelWith } = buildLinkMaps(links);
  const successorsByPred = buildSuccessorsByPredecessor(dependsOn);

  const manualStarts = new Map<string, Date | null>();
  const manualEnds = new Map<string, Date | null>();
  const starts = new Map<string, Date | null>();
  const ends = new Map<string, Date | null>();

  for (const phase of sorted) {
    manualStarts.set(phase.id, parseDate(phase.start_date));
    manualEnds.set(phase.id, parseDate(phase.end_date));
    starts.set(phase.id, parseDate(phase.start_date));
    ends.set(phase.id, parseDate(phase.end_date));
  }

  const clusters = parallelClusters(phaseIds, parallelWith);
  const MAX_ITER = 64;

  for (let iter = 0; iter < MAX_ITER; iter += 1) {
    let changed = false;

    for (const phase of sorted) {
      const depIds = dependsOn.get(phase.id) ?? [];
      const minStart = minStartFromDeps(phase.id, ends, dependsOn);
      const successorConstraintEnd = latestAllowedEndFromSuccessors(
        phase.id,
        starts,
        successorsByPred,
      );
      const resolved = resolvePhaseSchedule(
        phase,
        anchors.get(phase.id),
        manualStarts.get(phase.id) ?? null,
        manualEnds.get(phase.id) ?? null,
        minStart,
        depIds.length > 0,
        successorConstraintEnd,
      );

      if (resolved.start?.getTime() !== starts.get(phase.id)?.getTime()) {
        starts.set(phase.id, resolved.start);
        changed = true;
      }
      if (resolved.end?.getTime() !== ends.get(phase.id)?.getTime()) {
        ends.set(phase.id, resolved.end);
        changed = true;
      }
    }

    for (const cluster of clusters) {
      let clusterStart: Date | null = null;
      for (const id of cluster) {
        if (anchors.get(id) === "end") continue;
        const s = starts.get(id);
        if (s && (!clusterStart || s > clusterStart)) clusterStart = s;
      }
      if (!clusterStart) continue;
      for (const id of cluster) {
        if (anchors.get(id) === "end") continue;
        if (starts.get(id)?.getTime() !== clusterStart.getTime()) {
          starts.set(id, clusterStart);
          changed = true;
        }
      }
    }

    if (reapplyEndAnchors(sorted, anchors, manualEnds, starts, ends)) {
      changed = true;
    }

    for (const phase of sorted) {
      const start = starts.get(phase.id);
      if (!start) continue;
      const days = resolveDurationDays(phase);
      if (!days) continue;
      const mode: PdDurationMode = phase.duration_mode ?? "working_days";
      const anchor = anchors.get(phase.id);
      const manualEnd = manualEnds.get(phase.id);

      let newEnd: Date;
      if (anchor === "end" && manualEnd) {
        newEnd = manualEnd;
      } else {
        newEnd = calculateEndDate(start, days, mode);
      }

      if (newEnd.getTime() !== ends.get(phase.id)?.getTime()) {
        ends.set(phase.id, newEnd);
        changed = true;
      }
    }

    if (rollupParentDates(sorted, starts, ends)) {
      changed = true;
    }

    if (!changed) break;
  }

  return sorted.map((phase) => {
    const computedStart = starts.get(phase.id) ?? null;
    const computedEnd = ends.get(phase.id) ?? null;
    const manual = manualStarts.get(phase.id);
    const isShifted =
      Boolean(computedStart && manual && computedStart > manual) ||
      (dependsOn.get(phase.id)?.length ?? 0) > 0 ||
      (parallelWith.get(phase.id)?.length ?? 0) > 0;

    return { phase, computedStart, computedEnd, isShifted };
  });
}

export function buildPdGanttBars(
  phases: PdPhaseDetail[],
  links: PdPhaseLink[] = [],
): PdGanttBar[] {
  const timeline = computePdTimeline(phases, links);
  const byId = new Map(phases.map((p) => [p.id, p]));
  const { dependsOn } = buildLinkMaps(links);

  return timeline
    .filter((t) => t.computedStart && t.computedEnd)
    .map((t) => {
      const depIds = dependsOn.get(t.phase.id) ?? [];
      const depNames = depIds
        .map((id) => byId.get(id)?.name)
        .filter((n): n is string => Boolean(n));

      return {
        phaseId: t.phase.id,
        label: t.phase.name,
        start: t.computedStart!,
        end: t.computedEnd!,
        status: t.phase.status,
        isShifted: t.isShifted,
        dependsOnLabel: depNames.length > 0 ? depNames.join(", ") : null,
        picNames: t.phase.pics
          .map((p) => p.profile_name)
          .filter((n): n is string => Boolean(n)),
      };
    });
}

export function getProjectEstimatedEnd(
  phases: PdPhaseDetail[],
  links: PdPhaseLink[] = [],
): string | null {
  const timeline = computePdTimeline(phases, links);
  let latest: Date | null = null;
  for (const t of timeline) {
    if (t.computedEnd && (!latest || t.computedEnd > latest)) {
      latest = t.computedEnd;
    }
  }
  return latest ? formatIsoDate(latest) : null;
}

export const PD_PHASE_STATUS_LABELS: Record<PdPhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  delayed: "Delayed",
};

export const PD_PHASE_STATUS_STYLES: Record<PdPhaseStatus, string> = {
  not_started: "bg-stone-100 text-stone-700",
  in_progress: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  delayed: "bg-rose-100 text-rose-700",
};

export const PD_GANTT_PHASE_STYLES: Record<PdPhaseStatus, string> = {
  not_started: "bg-stone-400/80",
  in_progress: "bg-sky-500/85",
  completed: "bg-emerald-500/85",
  delayed: "bg-rose-500/90",
};

export function formatPdDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${day} ${month} ${d.getFullYear()}`;
}

export function formatPdDateFromIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (!d) return "—";
  return formatPdDate(d);
}

export function getPdGanttPosition(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number | null {
  const span = rangeEnd.getTime() - rangeStart.getTime();
  if (span <= 0) return null;
  const pos = ((date.getTime() - rangeStart.getTime()) / span) * 100;
  return Math.min(100, Math.max(0, pos));
}

export function getPdBarStyle(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): { left: number; width: number } {
  const left = getPdGanttPosition(start, rangeStart, rangeEnd) ?? 0;
  const right = getPdGanttPosition(end, rangeStart, rangeEnd) ?? 100;
  return {
    left,
    width: Math.max(right - left, 0.5),
  };
}

export { addCalendarDays as addDays, formatIsoDate as formatPdIsoDate };
