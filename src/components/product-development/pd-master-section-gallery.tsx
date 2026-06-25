"use client";

import { useRef } from "react";
import { ImagePlus, Loader2, Trash2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MASTER_IMAGE_ACCEPT } from "@/lib/product-development/master-images";
import type { PdFile } from "@/types/database";
import { cn } from "@/lib/utils";

interface PdMasterSectionGalleryProps {
  images: PdFile[];
  editable?: boolean;
  uploading?: boolean;
  onUpload?: (file: File) => void;
  onDelete?: (fileId: string) => void;
  className?: string;
}

export function PdMasterSectionGallery({
  images,
  editable = false,
  uploading = false,
  onUpload,
  onDelete,
  className,
}: PdMasterSectionGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && onUpload) onUpload(file);
    e.target.value = "";
  }

  if (images.length === 0 && !editable) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-stone-200 bg-stone-50/60 p-3 lg:border-r",
        className,
      )}
    >
      {images.map((image) => (
        <figure
          key={image.id}
          className="group relative overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm"
        >
          {image.download_url ? (
            <a
              href={image.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              title="Open full resolution"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.download_url}
                alt={image.file_name}
                className="max-h-[28rem] w-full object-contain"
                loading="lazy"
              />
            </a>
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-stone-400">
              Image unavailable
            </div>
          )}
          <figcaption className="border-t border-stone-100 px-2 py-1.5 text-[10px] text-stone-500">
            <span className="line-clamp-2">{image.file_name}</span>
          </figcaption>
          {image.download_url && (
            <a
              href={image.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              title="View full size"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </a>
          )}
          {editable && onDelete && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Remove this image?")) onDelete(image.id);
              }}
              className="absolute left-2 top-2 rounded-md bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              title="Remove image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </figure>
      ))}

      {editable && onUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={MASTER_IMAGE_ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="h-9 w-full border-dashed text-xs"
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading…" : "Add hi-res image"}
          </Button>
        </>
      )}
    </div>
  );
}
