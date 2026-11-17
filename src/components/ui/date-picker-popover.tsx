"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isIsoDate } from "@/lib/procurement/po-list-shipments";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

function parseIsoLocal(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

/** Monday-first month grid, including leading and trailing days. */
export function buildCalendarDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function formatTrigger(value: string | null): string {
  if (!value || !isIsoDate(value)) return "—";
  return parseIsoLocal(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMonth(month: Date): string {
  return month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

interface DatePickerPopoverProps {
  value: string | null;
  onChange: (value: string | null) => void;
  ariaLabel: string;
  disabled?: boolean;
  clearable?: boolean;
  pending?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export function DatePickerPopover({
  value,
  onChange,
  ariaLabel,
  disabled,
  clearable,
  pending,
  invalid,
  describedBy,
}: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    startOfMonth(value && isIsoDate(value) ? parseIsoLocal(value) : new Date()),
  );
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    function onMove() {
      place();
    }
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    const height = 340;
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 4);
    }
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setPosition({ top, left });
  }

  function toggle() {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    setMonth(
      startOfMonth(value && isIsoDate(value) ? parseIsoLocal(value) : new Date()),
    );
    place();
    setOpen(true);
  }

  function pick(day: Date) {
    onChange(toIsoDate(day));
    setOpen(false);
  }

  const days = buildCalendarDays(month);
  const todayIso = toIsoDate(new Date());
  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby={labelId}
            className="fixed z-[70] w-[17.5rem] rounded-lg border border-stone-200 bg-white p-3 shadow-lg"
            style={{ top: position.top, left: position.left }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                aria-label="Previous month"
                onClick={() => setMonth((current) => addMonths(current, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p id={labelId} className="text-sm font-medium text-stone-800">
                {formatMonth(month)}
              </p>
              <button
                type="button"
                className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                aria-label="Next month"
                onClick={() => setMonth((current) => addMonths(current, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-stone-400">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="py-1">
                  {weekday}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((day) => {
                const iso = toIsoDate(day);
                const inMonth = day.getMonth() === month.getMonth();
                const selected = value === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-label={formatTrigger(iso)}
                    aria-pressed={selected}
                    onClick={() => pick(day)}
                    className={cn(
                      "h-8 rounded text-sm",
                      inMonth ? "text-stone-800" : "text-stone-300",
                      selected
                        ? "bg-emerald-700 font-medium text-white"
                        : "hover:bg-emerald-50",
                      !selected && iso === todayIso && "ring-1 ring-emerald-600",
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            {clearable ? (
              <div className="mt-2 flex justify-end border-t border-stone-100 pt-2">
                <button
                  type="button"
                  className="text-xs font-medium text-stone-500 hover:text-stone-800"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Clear date
                </button>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        aria-busy={pending || undefined}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm text-stone-800 hover:bg-emerald-50 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-60",
          invalid && "ring-1 ring-red-400",
          pending && "opacity-70",
        )}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
        <span className="whitespace-nowrap">{formatTrigger(value)}</span>
      </button>
      {popover}
    </>
  );
}
