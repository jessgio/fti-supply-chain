"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { suppliersMatchingName } from "@/lib/procurement/supplier-list";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/types/database";

interface SupplierSelectProps {
  suppliers: Supplier[];
  value: string;
  onChange: (supplierId: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
}

type Choice = { id: string; name: string };

export function SupplierSelect({
  suppliers,
  value,
  onChange,
  placeholder = "Type a supplier name",
  emptyLabel = "No supplier",
  allowEmpty = true,
  disabled = false,
  className,
  size = "default",
}: SupplierSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightState, setHighlightState] = useState({
    query: "",
    open: false,
    index: 0,
  });
  const highlight =
    highlightState.query === query && highlightState.open === open
      ? highlightState.index
      : 0;

  function moveHighlight(index: number) {
    setHighlightState({ query, open, index });
  }
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selected = useMemo(
    () => suppliers.find((supplier) => supplier.id === value) ?? null,
    [suppliers, value],
  );

  const choices = useMemo(() => {
    const matches = suppliersMatchingName(suppliers, open ? query : "");
    const rows: Choice[] = matches.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
    }));
    const q = query.trim().toLowerCase();
    const showEmpty =
      allowEmpty && (q === "" || emptyLabel.toLowerCase().includes(q));
    return showEmpty ? [{ id: "", name: emptyLabel }, ...rows] : rows;
  }, [allowEmpty, emptyLabel, open, query, suppliers]);
  const activeIndex =
    choices.length === 0 ? 0 : Math.min(highlight, choices.length - 1);

  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setQuery("");
    }

    place();
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, choices]);

  function selectChoice(choice: Choice) {
    onChange(choice.id);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setQuery("");
        return;
      }
      moveHighlight(Math.min(activeIndex + 1, Math.max(choices.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = choices[activeIndex];
      if (open && choice) selectChoice(choice);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  }

  const menu =
    open && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg"
            style={{
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <ul id={listId} role="listbox" className="max-h-60 overflow-auto py-1">
              {choices.length === 0 ? (
                <li className="px-3 py-2 text-sm text-stone-500">
                  No matching suppliers.
                </li>
              ) : (
                choices.map((choice, index) => (
                  <li key={choice.id || "none"} role="option" aria-selected={choice.id === value}>
                    <button
                      type="button"
                      data-active={index === activeIndex ? "true" : "false"}
                      className={cn(
                        "flex w-full px-3 py-2 text-left text-sm hover:bg-stone-50",
                        index === activeIndex && "bg-stone-50",
                        choice.id === value && "bg-emerald-50 font-medium",
                        choice.id === "" && "text-stone-500",
                      )}
                      onMouseEnter={() => moveHighlight(index)}
                      onClick={() => selectChoice(choice)}
                    >
                      {choice.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={selected ? selected.name : placeholder}
        value={open ? query : (selected?.name ?? "")}
        className={cn(
          "w-full rounded-lg border border-stone-300 bg-white px-3 pr-8 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8" : "h-10",
        )}
        onFocus={(event) => {
          if (disabled) return;
          setQuery(selected?.name ?? "");
          setOpen(true);
          const input = event.currentTarget;
          requestAnimationFrame(() => input.select());
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown
        className={cn(
          "pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400",
          open && "rotate-180",
        )}
      />
      {menu}
    </div>
  );
}
