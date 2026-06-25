"use client";

import { useRef } from "react";
import { formatPdDateFromIso } from "@/lib/product-development/gantt";
import { cn } from "@/lib/utils";

interface PdScheduleDateFieldProps {
  value: string | null;
  onChange?: (iso: string | null) => void;
  readOnly?: boolean;
  title?: string;
  /** `inline` = schedule table cell; `form` = full-width master view field */
  variant?: "inline" | "form";
  className?: string;
}

export function PdScheduleDateField({
  value,
  onChange,
  readOnly,
  title,
  variant = "inline",
  className,
}: PdScheduleDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = value ? formatPdDateFromIso(value) : "";
  const textClass = variant === "form" ? "text-sm" : "text-xs";

  if (readOnly || !onChange) {
    return (
      <span
        className={cn(
          "block whitespace-nowrap tabular-nums text-stone-700",
          textClass,
          className,
        )}
        title={title}
      >
        {label || "—"}
      </span>
    );
  }

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
  }

  return (
    <button
      type="button"
      title={title}
      onClick={openPicker}
      className={cn(
        "block w-full whitespace-nowrap text-left tabular-nums text-stone-700 transition-colors hover:text-stone-900",
        textClass,
        variant === "form"
          ? "h-10 rounded-md border border-stone-300 bg-white px-3 hover:bg-stone-50"
          : "min-w-[8.5rem] rounded-md px-2 py-1 hover:bg-stone-100",
        !value && "text-stone-400",
        className,
      )}
    >
      {label || "Set date"}
      <input
        ref={inputRef}
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
    </button>
  );
}
