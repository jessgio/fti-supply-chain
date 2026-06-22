"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";

export interface PoTimelineLineItem {
  sku_code: string;
  sku_name: string | null;
  qty_ordered: number;
  qty_received?: number;
}

interface PoTimelinePoLinkProps {
  poId: string;
  poNumber: string;
  lineItems: PoTimelineLineItem[];
  className?: string;
}

const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 120;

export function PoTimelinePoLink({
  poId,
  poNumber,
  lineItems,
  className = "shrink-0 font-semibold text-rose-700 hover:underline",
}: PoTimelinePoLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const rect = linkRef.current?.getBoundingClientRect();
    if (!rect) return;

    const panelWidth = panelRef.current?.offsetWidth ?? 288;
    const viewportPadding = 12;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - viewportPadding) {
      left = Math.max(
        viewportPadding,
        window.innerWidth - panelWidth - viewportPadding,
      );
    }

    setCoords({
      top: rect.bottom + 6,
      left,
    });
  }, []);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleShow = useCallback(() => {
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearTimers, updatePosition]);

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }, [clearTimers]);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);

    const handleReposition = () => updatePosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, lineItems, updatePosition]);

  useEffect(() => clearTimers, [clearTimers]);

  return (
    <>
      <Link
        ref={linkRef}
        href={`/dashboard/procurement?po=${poId}`}
        className={className}
        onMouseEnter={scheduleShow}
        onMouseLeave={scheduleHide}
        onFocus={scheduleShow}
        onBlur={scheduleHide}
      >
        {poNumber}
      </Link>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="tooltip"
            className="fixed z-50 flex w-max min-w-72 max-h-[calc(100vh-1.5rem)] max-w-[min(calc(100vw-1.5rem),36rem)] flex-col overflow-hidden rounded-lg border border-stone-200 bg-white text-stone-900 shadow-lg"
            style={{ top: coords.top, left: coords.left }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-3 py-2">
              <p className="break-words text-xs font-semibold text-stone-900">
                {poNumber}
              </p>
              <p className="text-[11px] text-stone-500">Line items</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {lineItems.length === 0 ? (
                <p className="py-2 text-xs text-stone-500">
                  No line items on this PO.
                </p>
              ) : (
                <ul className="space-y-2">
                  {lineItems.map((item, index) => (
                    <li
                      key={`${item.sku_code}-${index}`}
                      className="flex items-start justify-between gap-4 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium text-stone-900">
                          {item.sku_code}
                        </p>
                        {item.sku_name ? (
                          <p className="break-words text-stone-500">
                            {item.sku_name}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 tabular-nums font-medium text-stone-900">
                        ×{formatNumber(item.qty_ordered)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
