"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  isOngoingPdProject,
  projectProductLabel,
  resolveProductProjectId,
} from "@/lib/product-development/formula-tracker-fields";
import { cn } from "@/lib/utils";
import type {
  PdFile,
  PdFormulaTrackerEntryDetail,
  PdProjectSummary,
} from "@/types/database";

const MAX_BRIEF_FILE_SIZE = 50 * 1024 * 1024;

const FIELD_CLASS =
  "w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={FIELD_CLASS}
    />
  );
}

function NumericInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      inputMode="numeric"
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
  );
}

function SingleSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  );
}

const MAIN_FEEDBACK_OPTIONS = ["Approved", "Revise", "HOLD"] as const;
const REVIEW_OPTIONS = ["Approved", "Revise"] as const;
const BENCHMARK_CONFIRM_OPTIONS = ["Yes", "No"] as const;
const NPD_CONFIRMATION_OPTIONS = ["Approved", "Revise", "HOLD"] as const;
const BENCHMARK_CHANGED_FROM_PREVIOUS_OPTIONS = [
  "Yes",
  "No",
  "There's no benchmark",
] as const;

export type FormulaTrackerFormState = {
  brief_concept: string;
  target_ingredient: string;
  product_project_id: string;
  sample_date: string;
  sample_trial_no: string;
  lab_no: string;
  texture_review: string;
  texture_benchmark: string;
  color_benchmark: string;
  benchmark_change_confirmation: string;
  benchmark_change_reason: string;
  efficacy_result: string;
  main_feedback: string;
  benchmark_changed_from_previous_feedback: string;
  benchmark_change_from_previous_explanation: string;
  texture_feedback: string;
  scent_feedback: string;
  scent_review: string;
  efficacy_feedback: string;
  summary: string;
  npd_confirmation: string;
  confirmation_date: string;
  confirmed_by: string;
};

export const EMPTY_FORM_STATE: FormulaTrackerFormState = {
  brief_concept: "",
  target_ingredient: "",
  product_project_id: "",
  sample_date: "",
  sample_trial_no: "",
  lab_no: "",
  texture_review: "",
  texture_benchmark: "",
  color_benchmark: "",
  benchmark_change_confirmation: "",
  benchmark_change_reason: "",
  efficacy_result: "",
  main_feedback: "",
  benchmark_changed_from_previous_feedback: "",
  benchmark_change_from_previous_explanation: "",
  texture_feedback: "",
  scent_feedback: "",
  scent_review: "",
  efficacy_feedback: "",
  summary: "",
  npd_confirmation: "",
  confirmation_date: "",
  confirmed_by: "",
};

function entryToFormState(
  entry: PdFormulaTrackerEntryDetail,
  projects: PdProjectSummary[],
): FormulaTrackerFormState {
  return {
    brief_concept: entry.brief_concept ?? "",
    target_ingredient: entry.target_ingredient ?? "",
    product_project_id: resolveProductProjectId(entry, projects),
    sample_date: entry.sample_date ?? "",
    sample_trial_no: (entry.sample_trial_no ?? "").replace(/\D/g, ""),
    lab_no: (entry.lab_no ?? "").replace(/\D/g, ""),
    texture_review: entry.texture_review ?? "",
    texture_benchmark: entry.texture_benchmark ?? "",
    color_benchmark: entry.color_benchmark ?? "",
    benchmark_change_confirmation: entry.benchmark_change_confirmation ?? "",
    benchmark_change_reason: entry.benchmark_change_reason ?? "",
    efficacy_result: entry.efficacy_result ?? "",
    main_feedback: entry.main_feedback ?? "",
    benchmark_changed_from_previous_feedback:
      entry.benchmark_changed_from_previous_feedback ?? "",
    benchmark_change_from_previous_explanation:
      entry.benchmark_change_from_previous_explanation ?? "",
    texture_feedback: entry.texture_feedback ?? "",
    scent_feedback: entry.scent_feedback ?? "",
    scent_review: entry.scent_review ?? "",
    efficacy_feedback: entry.efficacy_feedback ?? "",
    summary: entry.summary ?? "",
    npd_confirmation: entry.npd_confirmation ?? "",
    confirmation_date: entry.confirmation_date ?? "",
    confirmed_by: entry.confirmed_by ?? "",
  };
}

function formStateToPayload(
  state: FormulaTrackerFormState,
  projects: PdProjectSummary[],
) {
  const selectedProject = projects.find((p) => p.id === state.product_project_id);
  const payload: Record<string, string | null> = {
    parent_items: null,
    scent: null,
    product_project_id: state.product_project_id || null,
    product_name: selectedProject
      ? (selectedProject.product_name ?? selectedProject.name)
      : null,
  };
  for (const [key, value] of Object.entries(state)) {
    payload[key] = value.trim() || null;
  }
  if (state.texture_review !== "Revise") payload.texture_feedback = null;
  if (state.scent_review !== "Revise") payload.scent_feedback = null;
  if (state.efficacy_result !== "Revise") payload.efficacy_feedback = null;
  if (state.benchmark_change_confirmation !== "Yes") {
    payload.benchmark_change_reason = null;
  }
  if (state.main_feedback !== "Revise") {
    payload.benchmark_changed_from_previous_feedback = null;
    payload.benchmark_change_from_previous_explanation = null;
  } else if (state.benchmark_changed_from_previous_feedback !== "Yes") {
    payload.benchmark_change_from_previous_explanation = null;
  }
  return payload;
}

interface FormulaTrackerFormPageProps {
  projectId: string;
  entryId?: string;
}

export function FormulaTrackerFormPage({
  projectId,
  entryId,
}: FormulaTrackerFormPageProps) {
  const router = useRouter();
  const isNew = !entryId || entryId === "new";

  const [project, setProject] = useState<PdProjectSummary | null>(null);
  const [ongoingProjects, setOngoingProjects] = useState<PdProjectSummary[]>(
    [],
  );
  const [form, setForm] = useState<FormulaTrackerFormState>(EMPTY_FORM_STATE);
  const [briefFiles, setBriefFiles] = useState<PdFile[]>([]);
  const [pendingBriefFiles, setPendingBriefFiles] = useState<File[]>([]);
  const [isDraggingBriefFiles, setIsDraggingBriefFiles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [projectsRes, entryRes] = await Promise.all([
          fetch("/api/product-development/projects"),
          isNew
            ? Promise.resolve(null)
            : fetch(`/api/product-development/formula-tracker/${entryId}`),
        ]);

        const projectsData = await projectsRes.json();
        if (!projectsRes.ok) {
          throw new Error(projectsData.error ?? "Failed to load project");
        }

        const allProjects = (projectsData.projects as PdProjectSummary[]) ?? [];
        const ongoing = allProjects.filter(isOngoingPdProject);

        if (!active) return;
        setOngoingProjects(ongoing);

        const matched = allProjects.find((p) => p.id === projectId);
        if (!matched) throw new Error("Project not found");
        setProject(matched);

        if (isNew) {
          setForm({
            ...EMPTY_FORM_STATE,
            product_project_id: matched.id,
          });
        } else if (entryRes) {
          const entryData = await entryRes.json();
          if (!entryRes.ok) {
            throw new Error(entryData.error ?? "Failed to load entry");
          }
          const entry = entryData.entry as PdFormulaTrackerEntryDetail;
          if (!active) return;
          setForm(entryToFormState(entry, allProjects));
          setBriefFiles(entry.brief_files ?? []);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [projectId, entryId, isNew]);

  function updateField<K extends keyof FormulaTrackerFormState>(
    key: K,
    value: FormulaTrackerFormState[K],
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "texture_review" && value !== "Revise") {
        next.texture_feedback = "";
      }
      if (key === "scent_review" && value !== "Revise") {
        next.scent_feedback = "";
      }
      if (key === "efficacy_result" && value !== "Revise") {
        next.efficacy_feedback = "";
      }
      if (key === "benchmark_change_confirmation" && value !== "Yes") {
        next.benchmark_change_reason = "";
      }
      if (key === "main_feedback" && value !== "Revise") {
        next.benchmark_changed_from_previous_feedback = "";
        next.benchmark_change_from_previous_explanation = "";
      }
      if (
        key === "benchmark_changed_from_previous_feedback" &&
        value !== "Yes"
      ) {
        next.benchmark_change_from_previous_explanation = "";
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = formStateToPayload(form, ongoingProjects);

      if (isNew) {
        const res = await fetch("/api/product-development/formula-tracker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create entry");
        if (pendingBriefFiles.length > 0) {
          await uploadBriefFilesToEntry(data.entry.id, pendingBriefFiles);
          setPendingBriefFiles([]);
        }
        router.replace(
          `/dashboard/product-development/formula-tracker/${projectId}/${data.entry.id}`,
        );
        router.refresh();
      } else {
        const res = await fetch(
          `/api/product-development/formula-tracker/${entryId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save entry");
        setBriefFiles(data.entry.brief_files ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function validateBriefFiles(files: File[]): string | null {
    for (const file of files) {
      if (file.size > MAX_BRIEF_FILE_SIZE) {
        return `${file.name} exceeds 50 MB limit.`;
      }
    }
    return null;
  }

  async function uploadBriefFilesToEntry(targetEntryId: string, files: File[]) {
    if (files.length === 0) return;
    const validationError = validateBriefFiles(files);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      const res = await fetch(
        `/api/product-development/formula-tracker/${targetEntryId}/brief-file`,
        { method: "POST", body: formData },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setBriefFiles((prev) => [...prev, ...(data.files ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      throw err;
    } finally {
      setUploading(false);
    }
  }

  function handleBriefFilesSelect(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const validationError = validateBriefFiles(files);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    if (isNew) {
      setPendingBriefFiles((prev) => [...prev, ...files]);
      return;
    }
    uploadBriefFilesToEntry(entryId!, files).catch((err) => {
      setError(err instanceof Error ? err.message : "Upload failed");
    });
  }

  function handleBriefFileDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingBriefFiles(false);
    handleBriefFilesSelect(event.dataTransfer.files);
  }

  async function removeUploadedBriefFile(fileId: string) {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/formula-tracker/${entryId}/brief-file?file_id=${fileId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove file");
      setBriefFiles((prev) => prev.filter((file) => file.id !== fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove file");
    } finally {
      setUploading(false);
    }
  }

  function removePendingBriefFile(index: number) {
    setPendingBriefFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleDelete() {
    if (isNew || !entryId) return;
    if (!window.confirm("Delete this formula tracker entry?")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/formula-tracker/${entryId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      router.push(
        `/dashboard/product-development/formula-tracker?project=${projectId}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <p className="py-12 text-center text-sm text-stone-500">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/dashboard/product-development/formula-tracker?project=${projectId}`}
            className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to master table
          </Link>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Formula Tracker
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">
            {isNew ? "New sample entry" : "Edit sample entry"}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {project?.name}
            {project?.product_name && project.product_name !== project.name
              ? ` · ${project.product_name}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="text-rose-700 hover:bg-rose-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || deleting}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? "Create entry" : "Save changes"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Brief & product</CardTitle>
            <CardDescription>
              Core concept details and product reference for this sample.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Brief Concept">
              <TextArea
                value={form.brief_concept}
                onChange={(v) => updateField("brief_concept", v)}
                rows={2}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target Ingredient">
                <Input
                  value={form.target_ingredient}
                  onChange={(e) =>
                    updateField("target_ingredient", e.target.value)
                  }
                />
              </Field>
              <Field label="Product Name">
                <Select
                  value={form.product_project_id}
                  onChange={(e) =>
                    updateField("product_project_id", e.target.value)
                  }
                >
                  <option value="">Select product…</option>
                  {ongoingProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectProductLabel(p)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date">
                <Input
                  type="date"
                  value={form.sample_date}
                  onChange={(e) => updateField("sample_date", e.target.value)}
                />
              </Field>
              <Field label="Brief File">
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDraggingBriefFiles(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingBriefFiles(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (
                      e.currentTarget.contains(
                        e.relatedTarget as Node | null,
                      )
                    ) {
                      return;
                    }
                    setIsDraggingBriefFiles(false);
                  }}
                  onDrop={handleBriefFileDrop}
                  className={cn(
                    "overflow-hidden rounded-lg border bg-stone-50 transition-colors",
                    isDraggingBriefFiles
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-stone-300",
                  )}
                >
                  <div className="flex min-h-10 items-center gap-3 px-3 py-2">
                    <label
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700",
                        uploading
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-stone-50",
                      )}
                    >
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          if (e.target.files) {
                            handleBriefFilesSelect(e.target.files);
                          }
                          e.target.value = "";
                        }}
                      />
                      <FileUp className="h-4 w-4" />
                      {uploading ? "Uploading…" : "Upload file"}
                    </label>
                    <p className="text-xs text-stone-500">
                      Max file size 50MB. Drag and drop files here.
                      {isNew && pendingBriefFiles.length > 0
                        ? " · uploads on save"
                        : ""}
                    </p>
                  </div>
                  {(briefFiles.length > 0 || pendingBriefFiles.length > 0) && (
                    <ul className="space-y-1 border-t border-stone-200 px-3 py-2">
                      {briefFiles.map((file) => (
                        <li
                          key={file.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          {file.download_url ? (
                            <a
                              href={file.download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={file.file_name}
                              className="min-w-0 truncate text-emerald-700 hover:underline"
                            >
                              {file.file_name}
                            </a>
                          ) : (
                            <span
                              title={`${file.file_name} — link unavailable`}
                              className="min-w-0 truncate text-stone-400 line-through"
                            >
                              {file.file_name}
                            </span>
                          )}
                          {!isNew && (
                            <button
                              type="button"
                              onClick={() => removeUploadedBriefFile(file.id)}
                              disabled={uploading}
                              className="shrink-0 text-stone-400 hover:text-rose-600"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                      {pendingBriefFiles.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 text-xs text-stone-700"
                        >
                          <span className="min-w-0 truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removePendingBriefFile(index)}
                            className="shrink-0 text-stone-400 hover:text-rose-600"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sample & lab</CardTitle>
            <CardDescription>
              Trial and lab identifiers for this sample.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Sample Trial No">
              <NumericInput
                value={form.sample_trial_no}
                onChange={(v) => updateField("sample_trial_no", v)}
              />
            </Field>
            <Field label="Lab No">
              <NumericInput
                value={form.lab_no}
                onChange={(v) => updateField("lab_no", v)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Main feedback</CardTitle>
            <CardDescription>
              Overall disposition for this sample trial.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Main Feedback">
              <SingleSelect
                value={form.main_feedback}
                onChange={(v) => updateField("main_feedback", v)}
                options={[...MAIN_FEEDBACK_OPTIONS]}
              />
            </Field>
            {form.main_feedback === "Revise" && (
              <>
                <Field label="Did the benchmark change from the previous feedback?">
                  <SingleSelect
                    value={form.benchmark_changed_from_previous_feedback}
                    onChange={(v) =>
                      updateField("benchmark_changed_from_previous_feedback", v)
                    }
                    options={[...BENCHMARK_CHANGED_FROM_PREVIOUS_OPTIONS]}
                  />
                </Field>
                {form.benchmark_changed_from_previous_feedback === "Yes" && (
                  <Field label="Why? Explain why the benchmark(s) was/were changed.">
                    <TextArea
                      value={form.benchmark_change_from_previous_explanation}
                      onChange={(v) =>
                        updateField(
                          "benchmark_change_from_previous_explanation",
                          v,
                        )
                      }
                      rows={4}
                    />
                  </Field>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviews</CardTitle>
            <CardDescription>
              Sensory and efficacy review outcomes. Feedback fields appear when
              Revise is selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Texture Review">
                <SingleSelect
                  value={form.texture_review}
                  onChange={(v) => updateField("texture_review", v)}
                  options={[...REVIEW_OPTIONS]}
                />
              </Field>
              {form.texture_review === "Revise" && (
                <Field label="Texture Feedback / Explanation">
                  <TextArea
                    value={form.texture_feedback}
                    onChange={(v) => updateField("texture_feedback", v)}
                    rows={3}
                  />
                </Field>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scent Review">
                <SingleSelect
                  value={form.scent_review}
                  onChange={(v) => updateField("scent_review", v)}
                  options={[...REVIEW_OPTIONS]}
                />
              </Field>
              {form.scent_review === "Revise" && (
                <Field label="Scent Feedback / Explanation">
                  <TextArea
                    value={form.scent_feedback}
                    onChange={(v) => updateField("scent_feedback", v)}
                    rows={3}
                  />
                </Field>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Efficacy Result">
                <SingleSelect
                  value={form.efficacy_result}
                  onChange={(v) => updateField("efficacy_result", v)}
                  options={[...REVIEW_OPTIONS]}
                />
              </Field>
              {form.efficacy_result === "Revise" && (
                <Field label="Efficacy Feedback / Explanation">
                  <TextArea
                    value={form.efficacy_feedback}
                    onChange={(v) => updateField("efficacy_feedback", v)}
                    rows={3}
                  />
                </Field>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Benchmarks</CardTitle>
            <CardDescription>
              Texture and color benchmark references, plus any benchmark changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Texture Benchmark">
                <TextArea
                  value={form.texture_benchmark}
                  onChange={(v) => updateField("texture_benchmark", v)}
                  rows={3}
                />
              </Field>
              <Field label="Color Benchmark">
                <TextArea
                  value={form.color_benchmark}
                  onChange={(v) => updateField("color_benchmark", v)}
                  rows={3}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Benchmark Change Confirmation">
                <SingleSelect
                  value={form.benchmark_change_confirmation}
                  onChange={(v) =>
                    updateField("benchmark_change_confirmation", v)
                  }
                  options={[...BENCHMARK_CONFIRM_OPTIONS]}
                />
              </Field>
              {form.benchmark_change_confirmation === "Yes" && (
                <Field label="Benchmark Change Reason">
                  <TextArea
                    value={form.benchmark_change_reason}
                    onChange={(v) => updateField("benchmark_change_reason", v)}
                    rows={3}
                  />
                </Field>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary & confirmation</CardTitle>
            <CardDescription>
              Overall summary and NPD sign-off status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Summary">
              <TextArea
                value={form.summary}
                onChange={(v) => updateField("summary", v)}
                rows={4}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="NPD Confirmation">
                <SingleSelect
                  value={form.npd_confirmation}
                  onChange={(v) => updateField("npd_confirmation", v)}
                  options={[...NPD_CONFIRMATION_OPTIONS]}
                />
              </Field>
              <Field label="Confirmation Date">
                <Input
                  type="date"
                  value={form.confirmation_date}
                  onChange={(e) =>
                    updateField("confirmation_date", e.target.value)
                  }
                />
              </Field>
              <Field label="Confirmed By">
                <Input
                  value={form.confirmed_by}
                  onChange={(e) => updateField("confirmed_by", e.target.value)}
                  placeholder="Name of confirmer"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
