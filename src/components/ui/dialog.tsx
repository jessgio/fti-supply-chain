"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && selection.toString().length > 0);
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const backdropPointerDown = useRef(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleBackdropPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    backdropPointerDown.current = e.target === e.currentTarget;
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || !backdropPointerDown.current) return;
    if (hasTextSelection()) return;
    onClose();
  }

  function handleCloseClick() {
    if (hasTextSelection()) return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          "w-full max-w-2xl rounded-xl border border-stone-200 bg-white shadow-xl",
          className,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
          <div>
            <h2 className="text-base font-semibold text-stone-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-stone-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCloseClick}
            className="rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
