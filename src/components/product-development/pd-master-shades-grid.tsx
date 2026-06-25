"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { MASTER_IMAGE_ACCEPT } from "@/lib/product-development/master-images";
import {
  getMasterShadeImages,
  masterShadeImageCategory,
  type MasterShadeImageKind,
} from "@/lib/product-development/master-shades";
import { cn } from "@/lib/utils";
import type { PdMasterShade, PdProjectDetail } from "@/types/database";

interface PdMasterShadesGridProps {
  project: PdProjectDetail;
  editable?: boolean;
  uploadingKey?: string | null;
  onAddShade?: () => Promise<void>;
  onUpdateShadeName?: (shadeId: string, name: string) => Promise<void>;
  onDeleteShade?: (shadeId: string) => Promise<void>;
  onUploadShadeImage?: (
    shadeId: string,
    kind: MasterShadeImageKind,
    file: File,
  ) => Promise<void>;
}

function ShadeImageSlot({
  label,
  imageUrl,
  imageName,
  editable,
  uploading,
  onUpload,
}: {
  label: string;
  imageUrl?: string | null;
  imageName?: string;
  editable?: boolean;
  uploading?: boolean;
  onUpload?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <div
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden rounded-md border border-stone-200 bg-stone-50",
          label === "Swatch" ? "min-h-[5.5rem]" : "min-h-[4.5rem]",
        )}
      >
        {imageUrl ? (
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full"
            title="Open full resolution"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={imageName ?? label}
              className={cn(
                "mx-auto w-full object-contain",
                label === "Swatch" ? "max-h-28" : "max-h-20",
              )}
              loading="lazy"
            />
          </a>
        ) : editable ? (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex h-full min-h-[inherit] w-full flex-col items-center justify-center gap-1 px-2 py-3 text-stone-400 hover:bg-stone-100/80 hover:text-stone-600"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            <span className="text-[10px]">Upload</span>
          </button>
        ) : (
          <span className="px-2 py-4 text-[10px] text-stone-300">—</span>
        )}
        {editable && onUpload && (
          <input
            ref={inputRef}
            type="file"
            accept={MASTER_IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        )}
      </div>
    </div>
  );
}

function ShadeGridCell({
  shade,
  project,
  editable,
  uploadingKey,
  onUpdateShadeName,
  onDeleteShade,
  onUploadShadeImage,
}: {
  shade: PdMasterShade;
  project: PdProjectDetail;
  editable?: boolean;
  uploadingKey?: string | null;
  onUpdateShadeName?: (shadeId: string, name: string) => Promise<void>;
  onDeleteShade?: (shadeId: string) => Promise<void>;
  onUploadShadeImage?: (
    shadeId: string,
    kind: MasterShadeImageKind,
    file: File,
  ) => Promise<void>;
}) {
  const [name, setName] = useState(shade.shade_name);
  const images = getMasterShadeImages(project.files, shade.id);

  useEffect(() => {
    setName(shade.shade_name);
  }, [shade.shade_name]);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === shade.shade_name) {
      setName(shade.shade_name);
      return;
    }
    await onUpdateShadeName?.(shade.id, trimmed);
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm">
      <div className="bg-emerald-100 px-2 py-2 text-center">
        {editable ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-full bg-transparent text-center text-xs font-semibold text-emerald-900 outline-none placeholder:text-emerald-700/50"
            placeholder="Shade/variant name"
          />
        ) : (
          <p className="text-xs font-semibold text-emerald-900">{shade.shade_name}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 p-2">
        <ShadeImageSlot
          label="Tube"
          imageUrl={images.tube?.download_url}
          imageName={images.tube?.file_name}
          editable={editable}
          uploading={uploadingKey === `${shade.id}:tube`}
          onUpload={
            onUploadShadeImage
              ? (file) => onUploadShadeImage(shade.id, "tube", file)
              : undefined
          }
        />
        <ShadeImageSlot
          label="Swatch"
          imageUrl={images.swatch?.download_url}
          imageName={images.swatch?.file_name}
          editable={editable}
          uploading={uploadingKey === `${shade.id}:swatch`}
          onUpload={
            onUploadShadeImage
              ? (file) => onUploadShadeImage(shade.id, "swatch", file)
              : undefined
          }
        />
      </div>

      {editable && onDeleteShade && (
        <button
          type="button"
          title="Remove shade/variant"
          onClick={() => {
            if (confirm(`Remove "${shade.shade_name}"?`)) {
              void onDeleteShade(shade.id);
            }
          }}
          className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-stone-400 opacity-0 shadow-sm transition-opacity hover:text-rose-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function PdMasterShadesGrid({
  project,
  editable = false,
  uploadingKey = null,
  onAddShade,
  onUpdateShadeName,
  onDeleteShade,
  onUploadShadeImage,
}: PdMasterShadesGridProps) {
  const shades = [...project.master_shades].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  if (shades.length === 0 && !editable) {
    return (
      <p className="px-4 py-8 text-center text-sm text-stone-500">
        No shades/variants added yet.
      </p>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {shades.map((shade) => (
          <ShadeGridCell
            key={shade.id}
            shade={shade}
            project={project}
            editable={editable}
            uploadingKey={uploadingKey}
            onUpdateShadeName={onUpdateShadeName}
            onDeleteShade={onDeleteShade}
            onUploadShadeImage={onUploadShadeImage}
          />
        ))}

        {editable && onAddShade && (
          <button
            type="button"
            onClick={() => void onAddShade()}
            className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-stone-300 bg-stone-50/50 text-stone-500 transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-800"
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-medium">Add shade/variant</span>
          </button>
        )}
      </div>

      {editable && (
        <p className="text-xs text-stone-500">
          Each shade/variant shows the product tube and colour swatch. Click a shade/variant name
          to edit it. Upload hi-res PNG or JPEG images for best results.
        </p>
      )}
    </div>
  );
}
