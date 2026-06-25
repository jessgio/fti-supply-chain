"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
  createDefaultPhases,
  PdPhaseTable,
  phasesToInput,
} from "@/components/product-development/pd-phase-table";
import type { PhaseFormRow } from "@/components/product-development/pd-phase-table";

export default function NewPdProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [phases, setPhases] = useState<PhaseFormRow[]>(createDefaultPhases);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/product-development/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          product_name: productName.trim() || name.trim(),
          description: description.trim() || null,
          phases: phasesToInput(phases),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create project");
      router.push(
        `/dashboard/product-development/projects/${data.project.id}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell wide>
      <div className="mb-2">
        <Link
          href="/dashboard/product-development/projects"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-stone-900">New project</h1>
        <p className="mt-1 text-sm text-stone-500">
          The standard NPD schedule is pre-filled. Add dates and durations inline,
          or edit tasks as needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-stone-600">
                Project name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rambutan Pink Essence"
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">
                Product name
              </label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Defaults to project name"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief project overview (optional)"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project schedule</CardTitle>
            <CardDescription>
              Bold rows are phase headers. Indented rows are child tasks. Use +
              on a header to add a child task.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PdPhaseTable phases={phases} onChange={setPhases} />
          </CardContent>
        </Card>

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Link
            href="/dashboard/product-development/projects"
            className="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Cancel
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save & open roadmap"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
