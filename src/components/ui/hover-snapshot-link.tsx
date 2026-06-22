"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 120;

export interface SnapshotLineItem {
  sku_code: string;
  sku_name?: string | null;
  quantity: number;
  label?: string;
}

interface HoverSnapshotLinkProps {
  href: string;
  label: ReactNode;
  title?: string;
  subtitle?: string;
  snapshotUrl: string;
  className?: string;
  mapSnapshot?: (data: unknown) => {
    title?: string;
    subtitle?: string;
    lines: SnapshotLineItem[];
  };
}

export function HoverSnapshotLink({
  href,
  label,
  title,
  subtitle,
  snapshotUrl,
  className,
  mapSnapshot,
}: HoverSnapshotLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    title?: string;
    subtitle?: string;
    lines: SnapshotLineItem[];
  } | null>(null);

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

    setCoords({ top: rect.bottom + 6, left });
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

  const loadSnapshot = useCallback(async () => {
    if (snapshot) return;
    setLoading(true);
    try {
      const res = await fetch(snapshotUrl);
      const data = await res.json();
      if (!res.ok) return;
      setSnapshot(
        mapSnapshot
          ? mapSnapshot(data)
          : {
              title: data.title,
              subtitle: data.subtitle,
              lines: data.lines ?? [],
            },
      );
    } catch {
      // tooltip is optional
    } finally {
      setLoading(false);
    }
  }, [mapSnapshot, snapshot, snapshotUrl]);

  const scheduleShow = useCallback(() => {
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      void loadSnapshot();
      updatePosition();
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearTimers, loadSnapshot, updatePosition]);

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
  }, [open, snapshot, updatePosition]);

  useEffect(() => clearTimers, [clearTimers]);

  const panelTitle = snapshot?.title ?? title;
  const panelSubtitle = snapshot?.subtitle ?? subtitle;
  const lines = snapshot?.lines ?? [];

  return (
    <>
      <Link
        ref={linkRef}
        href={href}
        className={className}
        onMouseEnter={scheduleShow}
        onMouseLeave={scheduleHide}
        onFocus={scheduleShow}
        onBlur={scheduleHide}
      >
        {label}
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
              {panelTitle ? (
                <p className="break-words text-xs font-semibold text-stone-900">
                  {panelTitle}
                </p>
              ) : null}
              {panelSubtitle ? (
                <p className="text-[11px] text-stone-500">{panelSubtitle}</p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {loading ? (
                <p className="py-2 text-xs text-stone-500">Loading…</p>
              ) : lines.length === 0 ? (
                <p className="py-2 text-xs text-stone-500">No line items.</p>
              ) : (
                <ul className="space-y-2">
                  {lines.map((item, index) => (
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
                        {item.label ? (
                          <p className="text-stone-400">{item.label}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 tabular-nums font-medium text-stone-900">
                        ×{item.quantity.toLocaleString()}
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
