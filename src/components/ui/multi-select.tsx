"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
}

interface MultiSelectProps<T extends string> {
  options: MultiSelectOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  allLabel?: string;
  className?: string;
}

export function MultiSelect<T extends string>({
  options,
  value,
  onChange,
  allLabel = "All",
  className,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = new Set(value);

  const label =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (options.find((opt) => opt.value === value[0])?.label ?? allLabel)
        : `${value.length} selected`;

  function toggle(next: T) {
    if (selected.has(next)) {
      onChange(value.filter((item) => item !== next));
      return;
    }
    onChange([...value, next]);
  }

  function close() {
    setOpen(false);
    setMenuRect(null);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setMenuRect(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setMenuRect(null);
      }
    }

    function handleViewportChange() {
      setOpen(false);
      setMenuRect(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "mt-1 flex h-7 w-full min-w-[6.5rem] items-center justify-between gap-1 rounded-lg border border-stone-300 bg-white px-2 py-0 text-left text-xs text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600",
          value.length > 0 && "border-emerald-600",
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setMenuRect(buttonRef.current?.getBoundingClientRect() ?? null);
          setOpen(true);
        }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-stone-400" />
      </button>
      {open && menuRect
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-multiselectable="true"
              className="fixed z-50 max-h-64 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: menuRect.bottom + 4,
                left: menuRect.left,
                minWidth: Math.max(menuRect.width, 160),
              }}
            >
              {options.map((option) => {
                const checked = selected.has(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs text-stone-800 hover:bg-stone-50"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
