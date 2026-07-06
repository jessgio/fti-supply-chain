"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import type { StatusUpdate, StatusUpdateRecordEntityType } from "@/types/database";
import {
  formatStatusUpdateTime,
  formatScopedSkuLabel,
  statusUpdateBodyPreview,
} from "@/lib/status-updates/utils";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 120;

interface StatusUpdateNotesLinkProps {
  entityType: StatusUpdateRecordEntityType;
  entityId: string;
  count?: number;
  className?: string;
}

export function StatusUpdateNotesLink({
  entityType,
  entityId,
  count,
  className,
}: StatusUpdateNotesLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resolvedCount, setResolvedCount] = useState<number | null>(
    count ?? null,
  );
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);

  useEffect(() => {
    if (count !== undefined) {
      setResolvedCount(count);
      return;
    }

    let active = true;
    async function loadCount() {
      try {
        const params = new URLSearchParams({
          entity_type: entityType,
          ids: entityId,
        });
        const res = await fetch(`/api/status-updates/counts?${params.toString()}`);
        const data = await res.json();
        if (!active || !res.ok) return;
        const entry = (data.counts ?? []).find(
          (row: { entity_id: string }) => row.entity_id === entityId,
        );
        setResolvedCount(entry?.count ?? 0);
      } catch {
        if (active) setResolvedCount(0);
      }
    }

    void loadCount();
    return () => {
      active = false;
    };
  }, [count, entityId, entityType]);

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

  const updatePosition = useCallback(() => {
    const rect = linkRef.current?.getBoundingClientRect();
    if (!rect) return;

    const panelWidth = panelRef.current?.offsetWidth ?? 320;
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

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        entity_type: entityType,
        entity_id: entityId,
        limit: "5",
      });
      const res = await fetch(`/api/status-updates/by-entity?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) return;
      setUpdates(data.updates ?? []);
      setTotal(data.total ?? data.updates?.length ?? 0);
    } catch {
      // preview is optional
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  const scheduleShow = useCallback(() => {
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      void loadPreview();
      updatePosition();
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearTimers, loadPreview, updatePosition]);

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
  }, [open, updates, updatePosition]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!resolvedCount) return null;

  const noteLabel =
    resolvedCount === 1 ? "1 status note" : `${resolvedCount} status notes`;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
  }

  return (
    <>
      <Link
        ref={linkRef}
        href="/dashboard/status-updates"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100",
          className,
        )}
        onMouseEnter={scheduleShow}
        onMouseLeave={scheduleHide}
        onFocus={scheduleShow}
        onBlur={scheduleHide}
        onClick={handleClick}
        aria-label={noteLabel}
      >
        <MessageSquareText className="h-3 w-3 shrink-0" />
        <span>{resolvedCount}</span>
      </Link>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="tooltip"
            className="fixed z-50 flex w-max min-w-80 max-h-[calc(100vh-1.5rem)] max-w-[min(calc(100vw-1.5rem),28rem)] flex-col overflow-hidden rounded-lg border border-stone-200 bg-white text-stone-900 shadow-lg"
            style={{ top: coords.top, left: coords.left }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold text-stone-900">
                Recent status notes
              </p>
              <p className="text-[11px] text-stone-500">
                {total != null && total > updates.length
                  ? `Latest ${updates.length} of ${total}`
                  : `Latest ${Math.min(resolvedCount, 5)}`}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {loading ? (
                <p className="py-2 text-xs text-stone-500">Loading notes…</p>
              ) : updates.length === 0 ? (
                <p className="py-2 text-xs text-stone-500">No notes found.</p>
              ) : (
                <ul className="space-y-3">
                  {updates.map((update) => (
                    <li
                      key={update.id}
                      className="border-b border-stone-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500">
                        <span className="font-medium text-stone-700">
                          {update.author_name ?? "Unknown"}
                        </span>
                        <span>{formatStatusUpdateTime(update.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-800">
                        {statusUpdateBodyPreview(update.body)}
                      </p>
                      {(update.associated_products ?? update.scoped_skus ?? [])
                        .length > 0 ? (
                        <p className="mt-1 text-[11px] text-stone-400">
                      {(update.associated_products ?? update.scoped_skus ?? [])
                            .map((sku) => formatScopedSkuLabel(sku))
                            .join(", ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shrink-0 border-t border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-[11px] text-stone-500">
                Open Status Updates to view the full thread.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
