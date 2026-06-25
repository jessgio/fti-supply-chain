"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/dashboard/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import {
  PdProjectCard,
  PROJECT_CARD_COVER_CATEGORY,
} from "@/components/product-development/pd-project-card";
import type { PdProjectSummary } from "@/types/database";

export default function PdProjectsPage() {
  const [projects, setProjects] = useState<PdProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/product-development/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load projects");
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

  const filtered = projects.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.product_name ?? "").toLowerCase().includes(q) ||
      (p.manufacturer ?? "").toLowerCase().includes(q)
    );
  });

  const activeCount = projects.filter((p) => p.status === "active").length;

  function startEditing(project: PdProjectSummary) {
    setActionError(null);
    setEditingId(project.id);
    setEditName(project.name);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
  }

  async function saveProjectName(projectId: string) {
    const trimmed = editName.trim();
    if (!trimmed) {
      setActionError("Project name cannot be empty.");
      return;
    }

    setSavingId(projectId);
    setActionError(null);
    try {
      const res = await fetch(`/api/product-development/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update project");
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, name: data.project.name } : p,
        ),
      );
      cancelEditing();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteProject(project: PdProjectSummary) {
    if (
      !confirm(
        `Delete "${project.name}" permanently? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingId(project.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/product-development/projects/${project.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete project");
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      if (editingId === project.id) cancelEditing();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function uploadCover(projectId: string, file: File) {
    setUploadingId(projectId);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("file_category", PROJECT_CARD_COVER_CATEGORY);
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to upload image");
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                cover_image_url: data.file.download_url ?? null,
                cover_image_id: data.file.id,
              }
            : p,
        ),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to upload");
    } finally {
      setUploadingId(null);
    }
  }

  async function removeCover(project: PdProjectSummary) {
    if (!project.cover_image_id) return;
    if (!confirm("Remove this cover image?")) return;

    setUploadingId(project.id);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${project.id}/files?file_id=${project.cover_image_id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove image");
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? { ...p, cover_image_url: null, cover_image_id: null }
            : p,
        ),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Product Development
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">Projects</h1>
          <p className="mt-1 text-sm text-stone-500">
            Track product development phases, timelines, and deliverables.
          </p>
        </div>
        <Link
          href="/dashboard/product-development/projects/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" />
          New project
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total projects" value={String(projects.length)} />
        <StatCard label="Active" value={String(activeCount)} />
        <StatCard
          label="Completed"
          value={String(projects.filter((p) => p.status === "completed").length)}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ongoing projects</CardTitle>
            <CardDescription>
              Project cards show launch timing, upcoming phases, and manufacturer.
              Add a cover image on each card.
            </CardDescription>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
          )}
          {(error || actionError) && (
            <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error ?? actionError}
            </p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="py-12 text-center">
              <FolderKanban className="mx-auto h-10 w-10 text-stone-300" />
              <p className="mt-3 text-sm text-stone-500">
                {search ? "No matching projects." : "No projects yet."}
              </p>
              {!search && (
                <Link
                  href="/dashboard/product-development/projects/new"
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
                >
                  Create your first project
                </Link>
              )}
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((project) => (
                <PdProjectCard
                  key={project.id}
                  project={project}
                  isEditing={editingId === project.id}
                  editName={editName}
                  isSaving={savingId === project.id}
                  isDeleting={deletingId === project.id}
                  isUploading={uploadingId === project.id}
                  onEditNameChange={setEditName}
                  onStartEditing={() => startEditing(project)}
                  onCancelEditing={cancelEditing}
                  onSaveName={() => void saveProjectName(project.id)}
                  onDelete={() => void deleteProject(project)}
                  onUploadCover={(file) => void uploadCover(project.id, file)}
                  onRemoveCover={() => void removeCover(project)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
