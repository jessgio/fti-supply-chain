"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  Check,
  ImagePlus,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MASTER_IMAGE_ACCEPT } from "@/lib/product-development/master-images";
import { formatPdDateFromIso } from "@/lib/product-development/gantt";
import {
  formatDaysUntilLaunch,
  PROJECT_CARD_COVER_CATEGORY,
  upcomingPhaseLabel,
} from "@/lib/product-development/project-card";
import type { PdProjectSummary } from "@/types/database";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  active: "bg-sky-100 text-sky-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};

interface PdProjectCardProps {
  project: PdProjectSummary;
  isEditing: boolean;
  editName: string;
  isSaving: boolean;
  isDeleting: boolean;
  isUploading: boolean;
  onEditNameChange: (value: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveName: () => void;
  onDelete: () => void;
  onUploadCover: (file: File) => void;
  onRemoveCover: () => void;
}

export function PdProjectCard({
  project,
  isEditing,
  editName,
  isSaving,
  isDeleting,
  isUploading,
  onEditNameChange,
  onStartEditing,
  onCancelEditing,
  onSaveName,
  onDelete,
  onUploadCover,
  onRemoveCover,
}: PdProjectCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasCover = Boolean(project.cover_image_url);

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUploadCover(file);
    e.target.value = "";
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div
        className={cn(
          "flex min-h-[11rem] flex-1",
          hasCover ? "flex-row" : "flex-col",
        )}
      >
        {hasCover && (
          <div className="group relative w-32 shrink-0 border-r border-stone-100 bg-stone-50 sm:w-36">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.cover_image_url!}
              alt={`${project.name} cover`}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className="rounded-md bg-white/90 p-1.5 text-stone-700 hover:bg-white"
                title="Replace image"
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onRemoveCover}
                disabled={isUploading}
                className="rounded-md bg-white/90 p-1.5 text-rose-600 hover:bg-white"
                title="Remove image"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={MASTER_IMAGE_ACCEPT}
              className="hidden"
              onChange={handleCoverChange}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            {isEditing ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSaveName();
                    }
                    if (e.key === "Escape") onCancelEditing();
                  }}
                  autoFocus
                  disabled={isSaving}
                  className="h-8 min-w-[10rem] flex-1"
                />
                <Button size="sm" onClick={onSaveName} disabled={isSaving}>
                  <Check className="h-3.5 w-3.5" />
                  {isSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancelEditing}
                  disabled={isSaving}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Link
                href={`/dashboard/product-development/projects/${project.id}`}
                className="min-w-0 flex-1"
              >
                <h3 className="truncate font-semibold text-stone-900 hover:text-emerald-800">
                  {project.name}
                </h3>
                {project.product_name && project.product_name !== project.name && (
                  <p className="mt-0.5 truncate text-xs text-stone-500">
                    {project.product_name}
                  </p>
                )}
              </Link>
            )}

            {!isEditing && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={onStartEditing}
                  disabled={isDeleting}
                  aria-label={`Rename ${project.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={onDelete}
                  disabled={isDeleting}
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className={STATUS_STYLES[project.status] ?? ""}>
              {project.status.replace(/_/g, " ")}
            </Badge>
            <span className="text-xs text-stone-500">
              {project.completed_phases}/{project.phase_count} phases
            </span>
          </div>

          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs font-medium text-stone-500">
                Target launch date
              </dt>
              <dd className="text-stone-800">
                {formatPdDateFromIso(project.launch_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">
                Days left until launch
              </dt>
              <dd
                className={cn(
                  "font-medium",
                  project.days_until_launch != null && project.days_until_launch < 0
                    ? "text-rose-600"
                    : project.days_until_launch === 0
                      ? "text-emerald-700"
                      : "text-stone-800",
                )}
              >
                {formatDaysUntilLaunch(project.days_until_launch)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Manufacturer</dt>
              <dd className="text-stone-800">
                {project.manufacturer?.trim() || "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">
                Upcoming phases (next 7 days)
              </dt>
              <dd className="text-stone-800">
                {project.upcoming_phases_7d.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                    {project.upcoming_phases_7d.map((phase) => (
                      <li key={`${phase.name}-${phase.start_date}-${phase.end_date}`}>
                        {upcomingPhaseLabel(phase)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-stone-500">None scheduled</span>
                )}
              </dd>
            </div>
          </dl>

          {!hasCover && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-3 py-2 text-xs font-medium text-stone-500 transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              Add cover image
            </button>
          )}
          {!hasCover && (
            <input
              ref={inputRef}
              type="file"
              accept={MASTER_IMAGE_ACCEPT}
              className="hidden"
              onChange={handleCoverChange}
            />
          )}
        </div>
      </div>

      {!isEditing && (
        <Link
          href={`/dashboard/product-development/projects/${project.id}`}
          className="border-t border-stone-100 px-4 py-2 text-center text-xs font-medium text-emerald-800 hover:bg-emerald-50/60"
        >
          Open project
        </Link>
      )}
    </article>
  );
}

export { PROJECT_CARD_COVER_CATEGORY };
