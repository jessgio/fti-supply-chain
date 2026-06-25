"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  FORMULA_TRACKER_FIELD_SECTIONS,
  formatFieldValue,
} from "@/lib/product-development/formula-tracker-fields";
import {
  buildTrialTimelines,
  formatDateRange,
  formatDurationDays,
  type FormulaTrackerTrialTimeline,
} from "@/lib/product-development/formula-tracker-timeline";
import { formatDate } from "@/lib/utils";
import type { PdFormulaTrackerMasterProject } from "@/types/database";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  active: "bg-sky-100 text-sky-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};

function ExpandButton({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      aria-label={label}
      aria-expanded={open}
    >
      {open ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
    </button>
  );
}

function TrialDetailPanel({
  entry,
  projectId,
}: {
  entry: PdFormulaTrackerMasterProject["entries"][number];
  projectId: string;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-800">Trial details</p>
        <Link
          href={`/dashboard/product-development/formula-tracker/${projectId}/${entry.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit entry
        </Link>
      </div>

      {entry.brief_files.length > 0 && (
        <div className="rounded-md bg-stone-50 px-3 py-2 text-sm">
          <span className="font-medium text-stone-700">Brief Files: </span>
          <ul className="mt-1 space-y-1">
            {entry.brief_files.map((file) => (
              <li key={file.id}>
                {file.download_url ? (
                  <a
                    href={file.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={file.file_name}
                    className="text-emerald-700 hover:underline"
                  >
                    {file.file_name}
                  </a>
                ) : (
                  <span
                    title={`${file.file_name} — link unavailable`}
                    className="text-stone-400 line-through"
                  >
                    {file.file_name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {FORMULA_TRACKER_FIELD_SECTIONS.map((section) => {
          const populated = section.fields.filter((field) =>
            formatFieldValue(entry, field),
          );
          if (populated.length === 0) return null;
          return (
            <div key={section.title} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {section.title}
              </p>
              <dl className="space-y-2">
                {populated.map((field) => (
                  <div key={field.key}>
                    <dt className="text-xs font-medium text-stone-500">
                      {field.label}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">
                      {formatFieldValue(entry, field)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ProjectTrialRows = memo(function ProjectTrialRows({
  projectId,
  entries,
  expandedTrials,
  toggleTrial,
}: {
  projectId: string;
  entries: PdFormulaTrackerMasterProject["entries"];
  expandedTrials: Set<string>;
  toggleTrial: (id: string) => void;
}) {
  const timelines = useMemo(() => buildTrialTimelines(entries), [entries]);

  if (timelines.length === 0) {
    return (
      <tr className="border-b border-stone-100 bg-stone-50/20">
        <td />
        <td colSpan={8} className="py-4 pl-2 text-sm text-stone-500">
          No sample trials recorded for this project yet.
        </td>
      </tr>
    );
  }

  return (
    <>
      {timelines.map((timeline: FormulaTrackerTrialTimeline) => {
        const { entry } = timeline;
        const trialOpen = expandedTrials.has(entry.id);
        const isLatest =
          timeline.daysUntilNext == null && entry.sample_date != null;

        return (
          <Fragment key={entry.id}>
            <tr className="border-b border-stone-100 hover:bg-stone-50/60">
              <td className="py-2.5 pl-4">
                <ExpandButton
                  open={trialOpen}
                  onClick={() => toggleTrial(entry.id)}
                  label={trialOpen ? "Collapse trial details" : "Expand trial details"}
                />
              </td>
              <td className="py-2.5 pr-4">
                <span className="font-medium text-stone-800">
                  {entry.sample_trial_no ?? "Untitled trial"}
                </span>
                {entry.brief_concept && (
                  <p
                    className="mt-0.5 line-clamp-1 text-xs text-stone-500"
                    title={entry.brief_concept}
                  >
                    {entry.brief_concept}
                  </p>
                )}
              </td>
              <td className="py-2.5 pr-4 text-stone-600">
                {entry.product_name ?? "—"}
              </td>
              <td className="py-2.5 pr-4 text-stone-600">
                {formatDate(entry.sample_date)}
              </td>
              <td className="py-2.5 pr-4 text-stone-600">
                {formatDurationDays(timeline.daysSincePrevious)}
              </td>
              <td className="py-2.5 pr-4 text-stone-600">
                {timeline.daysUntilNext != null
                  ? formatDurationDays(timeline.daysUntilNext)
                  : isLatest
                    ? `${formatDurationDays(timeline.cycleDays)} (ongoing)`
                    : "—"}
              </td>
              <td className="py-2.5 pr-4 text-stone-600">{entry.lab_no ?? "—"}</td>
              <td className="py-2.5 pr-4 text-stone-600">
                {entry.npd_confirmation ?? "—"}
              </td>
              <td className="py-2.5 text-right">
                <Link
                  href={`/dashboard/product-development/formula-tracker/${projectId}/${entry.id}`}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  Edit
                </Link>
              </td>
            </tr>
            {trialOpen && (
              <tr className="border-b border-stone-100 bg-stone-50/30">
                <td />
                <td colSpan={8} className="py-3 pr-4 pl-2">
                  <TrialDetailPanel entry={entry} projectId={projectId} />
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
});

interface FormulaTrackerMasterTableProps {
  highlightProjectId?: string;
}

export function FormulaTrackerMasterTable({
  highlightProjectId,
}: FormulaTrackerMasterTableProps) {
  const [projects, setProjects] = useState<PdFormulaTrackerMasterProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(highlightProjectId ? [highlightProjectId] : []),
  );
  const [expandedTrials, setExpandedTrials] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/product-development/formula-tracker?view=master",
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (highlightProjectId) {
      setExpandedProjects((prev) => new Set(prev).add(highlightProjectId));
    }
  }, [highlightProjectId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => {
      const haystack = [
        project.project_name,
        project.product_name ?? "",
        ...project.entries.flatMap((e) => [
          e.sample_trial_no ?? "",
          e.lab_no ?? "",
          e.product_name ?? "",
          e.npd_confirmation ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [projects, search]);

  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleTrial(trialId: string) {
    setExpandedTrials((prev) => {
      const next = new Set(prev);
      if (next.has(trialId)) next.delete(trialId);
      else next.add(trialId);
      return next;
    });
  }

  const totalTrials = projects.reduce((sum, p) => sum + p.trial_count, 0);

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Product Development
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">
            Formula Tracker
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Review sample trials by project — expand a project to see when each
            trial occurred and how long each cycle lasted, then expand a trial
            for full form details.
          </p>
        </div>
        <Link
          href="/dashboard/product-development/projects"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          View projects
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Projects with trials
            </p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {projects.filter((p) => p.trial_count > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Total sample trials
            </p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {totalTrials}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Active projects
            </p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {projects.filter((p) => p.project_status === "active").length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Master table</CardTitle>
            <CardDescription>
              Projects on the first level, sample trials nested underneath.
              Expand a trial to read the full form contents.
            </CardDescription>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects or trials…"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
          )}
          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-stone-500">
              {search ? "No matching projects or trials." : "No projects yet."}
            </p>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs font-medium uppercase tracking-wide text-stone-500">
                    <th className="w-8 py-2" />
                    <th className="py-2 pr-4">Project / Trial</th>
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Trial date</th>
                    <th className="py-2 pr-4">Since previous</th>
                    <th className="py-2 pr-4">Cycle length</th>
                    <th className="py-2 pr-4">Lab No</th>
                    <th className="py-2 pr-4">NPD</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((project) => {
                    const projectOpen = expandedProjects.has(project.project_id);

                    return (
                      <Fragment key={project.project_id}>
                        <tr className="border-b border-stone-100 bg-stone-50/40">
                          <td className="py-3">
                            <ExpandButton
                              open={projectOpen}
                              onClick={() => toggleProject(project.project_id)}
                              label={
                                projectOpen
                                  ? "Collapse project"
                                  : "Expand project"
                              }
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-stone-900">
                                {project.project_name}
                              </span>
                              <Badge
                                className={
                                  STATUS_STYLES[project.project_status] ?? ""
                                }
                              >
                                {project.project_status.replace(/_/g, " ")}
                              </Badge>
                              <span className="text-xs text-stone-500">
                                {project.trial_count} trial
                                {project.trial_count === 1 ? "" : "s"}
                              </span>
                            </div>
                            {project.trial_count > 0 && (
                              <p className="mt-0.5 text-xs text-stone-500">
                                {formatDateRange(
                                  project.first_trial_date,
                                  project.last_trial_date,
                                )}
                                {project.total_span_days != null &&
                                  project.total_span_days > 0 &&
                                  ` · ${formatDurationDays(project.total_span_days)} total span`}
                              </p>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-stone-600">
                            {project.product_name ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-stone-400">—</td>
                          <td className="py-3 pr-4 text-stone-400">—</td>
                          <td className="py-3 pr-4 text-stone-400">—</td>
                          <td className="py-3 pr-4 text-stone-400">—</td>
                          <td className="py-3 pr-4 text-stone-400">—</td>
                          <td className="py-3 text-right">
                            <Link
                              href={`/dashboard/product-development/formula-tracker/${project.project_id}/new`}
                            >
                              <Button size="sm" variant="outline">
                                <Plus className="h-3.5 w-3.5" />
                                Add trial
                              </Button>
                            </Link>
                          </td>
                        </tr>

                        {projectOpen && (
                          <ProjectTrialRows
                            projectId={project.project_id}
                            entries={project.entries}
                            expandedTrials={expandedTrials}
                            toggleTrial={toggleTrial}
                          />
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
