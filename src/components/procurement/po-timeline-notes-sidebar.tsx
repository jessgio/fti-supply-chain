"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareText, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusUpdateCard } from "@/components/status-updates/status-update-card";
import { cn } from "@/lib/utils";
import type { Profile, StatusUpdate, UserRole } from "@/types/database";

interface PoTimelineNotesSidebarProps {
  poId: string;
  poNumber: string;
  noteCount?: number;
  profiles: Profile[];
  currentUserId?: string | null;
  currentUserRole?: UserRole | null;
}

export function PoTimelineNotesSidebar({
  poId,
  poNumber,
  noteCount = 0,
  profiles,
  currentUserId = null,
  currentUserRole = null,
}: PoTimelineNotesSidebarProps) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        entity_type: "po",
        entity_id: poId,
        limit: "200",
      });
      const res = await fetch(`/api/status-updates/by-entity?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load notes");
      }
      setUpdates(data.updates ?? []);
      setTotal(data.total ?? data.updates?.length ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    if (!open) return;
    void loadNotes();
  }, [open, loadNotes]);

  function refresh() {
    void loadNotes();
  }

  const countLabel =
    noteCount > 0 ? String(noteCount) : null;

  return (
    <div className="flex shrink-0 items-stretch self-start">
      {open ? (
        <aside className="flex w-80 flex-col rounded-lg border border-stone-200 bg-stone-50 shadow-sm">
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Status notes
              </p>
              <p className="truncate text-sm font-medium text-stone-900">
                {poNumber}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              onClick={() => setOpen(false)}
              aria-label="Hide status notes"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[min(70vh,32rem)] min-h-[10rem] overflow-y-auto px-2 py-2">
            {loading ? (
              <p className="px-2 py-6 text-center text-xs text-stone-500">
                Loading notes…
              </p>
            ) : error ? (
              <p className="px-2 py-6 text-center text-xs text-rose-600">
                {error}
              </p>
            ) : updates.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-stone-500">
                No status notes for this PO yet.
              </p>
            ) : (
              <div className="space-y-2">
                {updates.map((update) => (
                  <StatusUpdateCard
                    key={update.id}
                    update={update}
                    profiles={profiles}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    onReplyPosted={refresh}
                    onUpdated={refresh}
                    onDeleted={refresh}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-1 border-t border-stone-200 px-3 py-2">
            {total > updates.length ? (
              <p className="text-[11px] text-stone-500">
                Showing {updates.length} of {total} notes.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href="/dashboard/status-updates/new"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                <Plus className="h-3 w-3" />
                New note
              </Link>
              <Link
                href="/dashboard/status-updates"
                className="text-xs text-stone-500 hover:text-stone-800 hover:underline"
              >
                All updates
              </Link>
            </div>
          </div>
        </aside>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className={cn(
            "h-auto gap-1.5 px-2.5 py-2",
            noteCount > 0 &&
              "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
          )}
          aria-label="Show status notes"
        >
          <PanelRightOpen className="h-4 w-4 shrink-0" />
          <MessageSquareText className="h-4 w-4 shrink-0" />
          {countLabel ? (
            <span className="text-xs font-medium">{countLabel}</span>
          ) : (
            <span className="text-xs font-medium">Notes</span>
          )}
        </Button>
      )}
    </div>
  );
}
