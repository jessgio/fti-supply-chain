"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { StatusUpdateNotesSnapshot } from "@/components/status-updates/status-update-notes-snapshot";
import type {
  StatusUpdate,
  StatusUpdateRecordEntityType,
} from "@/types/database";
import {
  formatStatusUpdateTime,
  formatScopedSkuLabel,
  statusUpdateBodyPreview,
} from "@/lib/status-updates/utils";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 120;

export interface StatusUpdateNotesSnapshotConfig {
  poNumber: string;
  skus: Array<{ id: string; sku_code: string; name?: string | null }>;
  onCountsMaybeChanged?: () => void;
}

interface StatusUpdateNotesLinkProps {
  entityType: StatusUpdateRecordEntityType;
  entityId: string;
  count?: number;
  /** Latest note id for deep-linking into Status Updates. */
  latestNoteId?: string | null;
  className?: string;
  /**
   * When set (PO context), clicking the badge opens an interactive snapshot
   * window for reading, replying, and posting notes.
   */
  snapshot?: StatusUpdateNotesSnapshotConfig;
}

function noteHref(noteId: string) {
  return `/dashboard/status-updates?note=${noteId}`;
}

export function StatusUpdateNotesLink({
  entityType,
  entityId,
  count,
  latestNoteId,
  className,
  snapshot,
}: StatusUpdateNotesLinkProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resolvedCount, setResolvedCount] = useState<number | null>(
    count ?? null,
  );
  const [resolvedLatestId, setResolvedLatestId] = useState<string | null>(
    latestNoteId ?? null,
  );
  const [open, setOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);

  useEffect(() => {
    if (count !== undefined) {
      setResolvedCount(count);
    }
  }, [count]);

  useEffect(() => {
    if (latestNoteId !== undefined) {
      setResolvedLatestId(latestNoteId ?? null);
    }
  }, [latestNoteId]);

  useEffect(() => {
    if (count !== undefined && latestNoteId !== undefined) return;

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
        if (count === undefined) {
          setResolvedCount(entry?.count ?? 0);
        }
        if (latestNoteId === undefined) {
          setResolvedLatestId(entry?.latest_id ?? null);
        }
      } catch {
        if (active && count === undefined) setResolvedCount(0);
      }
    }

    void loadCount();
    return () => {
      active = false;
    };
  }, [count, entityId, entityType, latestNoteId]);

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
    const rect = triggerRef.current?.getBoundingClientRect();
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
      const nextUpdates = (data.updates ?? []) as StatusUpdate[];
      setUpdates(nextUpdates);
      setTotal(data.total ?? nextUpdates.length);
      if (nextUpdates[0]?.id) {
        setResolvedLatestId(nextUpdates[0].id);
      }
    } catch {
      // preview is optional
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  const scheduleShow = useCallback(() => {
    if (snapshotOpen) return;
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      void loadPreview();
      updatePosition();
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearTimers, loadPreview, snapshotOpen, updatePosition]);

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

  const hasNotes = (resolvedCount ?? 0) > 0;
  if (!hasNotes && !snapshot) return null;

  const noteLabel = !hasNotes
    ? "Add status note"
    : resolvedCount === 1
      ? "1 status note"
      : `${resolvedCount} status notes`;

  const feedHref = resolvedLatestId
    ? noteHref(resolvedLatestId)
    : "/dashboard/status-updates";

  function handleBadgeClick(event: MouseEvent) {
    event.stopPropagation();
    if (!snapshot) return;
    event.preventDefault();
    clearTimers();
    setOpen(false);
    setSnapshotOpen(true);
  }

  const badgeClassName = cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
    hasNotes
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
    className,
  );

  const setTriggerRef: Ref<HTMLButtonElement | HTMLAnchorElement> = (node) => {
    triggerRef.current = node;
  };

  return (
    <>
      {snapshot ? (
        <button
          ref={setTriggerRef}
          type="button"
          className={badgeClassName}
          onMouseEnter={hasNotes ? scheduleShow : undefined}
          onMouseLeave={hasNotes ? scheduleHide : undefined}
          onFocus={hasNotes ? scheduleShow : undefined}
          onBlur={hasNotes ? scheduleHide : undefined}
          onClick={handleBadgeClick}
          aria-label={noteLabel}
        >
          <MessageSquareText className="h-3 w-3 shrink-0" />
          <span>{hasNotes ? resolvedCount : "+"}</span>
        </button>
      ) : (
        <Link
          ref={setTriggerRef}
          href={feedHref}
          className={badgeClassName}
          onMouseEnter={scheduleShow}
          onMouseLeave={scheduleHide}
          onFocus={scheduleShow}
          onBlur={scheduleHide}
          onClick={(event) => event.stopPropagation()}
          aria-label={noteLabel}
        >
          <MessageSquareText className="h-3 w-3 shrink-0" />
          <span>{resolvedCount}</span>
        </Link>
      )}

      {open &&
        hasNotes &&
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
                  : `Latest ${Math.min(resolvedCount ?? 0, 5)}`}
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
                      <Link
                        href={noteHref(update.id)}
                        className="block rounded-md outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
                        onClick={(event) => event.stopPropagation()}
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
                            {(
                              update.associated_products ??
                              update.scoped_skus ??
                              []
                            )
                              .map((sku) => formatScopedSkuLabel(sku))
                              .join(", ")}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shrink-0 border-t border-stone-200 bg-stone-50 px-3 py-2">
              {snapshot ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-emerald-700 hover:underline"
                  onClick={() => {
                    setOpen(false);
                    setSnapshotOpen(true);
                  }}
                >
                  Open notes window to reply or post
                </button>
              ) : (
                <p className="text-[11px] text-stone-500">
                  Click a note to open it in Status Updates.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}

      {snapshot && entityType === "po" ? (
        <StatusUpdateNotesSnapshot
          open={snapshotOpen}
          onClose={() => setSnapshotOpen(false)}
          poId={entityId}
          poNumber={snapshot.poNumber}
          skus={snapshot.skus}
          onCountsMaybeChanged={snapshot.onCountsMaybeChanged}
        />
      ) : null}
    </>
  );
}
