"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { MentionInput } from "@/components/status-updates/mention-input";
import { StatusUpdateCard } from "@/components/status-updates/status-update-card";
import { createClient } from "@/lib/supabase/client";
import { extractMentionIds } from "@/lib/status-updates/utils";
import { resolveProductLineLabel } from "@/lib/procurement/product-line-label";
import type { Profile, StatusUpdate, UserRole } from "@/types/database";

export interface StatusUpdateSnapshotSku {
  id: string;
  sku_code: string;
  name?: string | null;
}

interface StatusUpdateNotesSnapshotProps {
  open: boolean;
  onClose: () => void;
  poId: string;
  poNumber: string;
  skus: StatusUpdateSnapshotSku[];
  onCountsMaybeChanged?: () => void;
}

export function StatusUpdateNotesSnapshot({
  open,
  onClose,
  poId,
  poNumber,
  skus,
  onCountsMaybeChanged,
}: StatusUpdateNotesSnapshotProps) {
  const uniqueSkus = useMemo(() => {
    const seen = new Set<string>();
    const next: StatusUpdateSnapshotSku[] = [];
    for (const sku of skus) {
      if (!sku.id || seen.has(sku.id)) continue;
      seen.add(sku.id);
      next.push(sku);
    }
    return next;
  }, [skus]);

  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [posting, setPosting] = useState(false);

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
      if (!res.ok) throw new Error(data.error ?? "Failed to load notes");
      setUpdates(data.updates ?? []);
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

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function loadContext() {
      try {
        const [profileRes, auth] = await Promise.all([
          fetch("/api/product-development/profiles"),
          createClient().auth.getUser(),
        ]);
        const profileData = await profileRes.json();
        if (!active) return;
        if (profileRes.ok) {
          const list = (profileData.profiles ?? []) as Profile[];
          setProfiles(list);
          const userId = auth.data.user?.id ?? null;
          setCurrentUserId(userId);
          const mine = userId
            ? list.find((profile) => profile.id === userId)
            : null;
          setCurrentUserRole(mine?.role ?? null);
        }
      } catch {
        // Mentions/replies still work with empty profiles; edit permissions degrade.
      }
    }
    void loadContext();
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedSkuId((prev) => {
      if (prev && uniqueSkus.some((sku) => sku.id === prev)) return prev;
      return uniqueSkus[0]?.id ?? "";
    });
    setNoteDraft("");
    setError(null);
  }, [open, uniqueSkus, poId]);

  function refresh() {
    void loadNotes();
    onCountsMaybeChanged?.();
  }

  async function postNote() {
    if (!selectedSkuId || !noteDraft.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/status-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: selectedSkuId,
          po_id: poId,
          body: noteDraft.trim(),
          mentioned_user_ids: extractMentionIds(noteDraft),
          applies_to_all_po_products: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post update");
      setNoteDraft("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post update");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Status notes · ${poNumber}`}
      description="Read, reply, or post a new note without leaving procurement."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="max-h-[min(50vh,28rem)] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">
              Loading notes…
            </p>
          ) : updates.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              No status notes for this PO yet.
            </p>
          ) : (
            updates.map((update) => (
              <div key={update.id} className="space-y-1">
                <div className="flex justify-end">
                  <Link
                    href={`/dashboard/status-updates?note=${update.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in Status Updates
                  </Link>
                </div>
                <StatusUpdateCard
                  update={update}
                  profiles={profiles}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  onReplyPosted={refresh}
                  onUpdated={refresh}
                  onDeleted={refresh}
                />
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t border-stone-200 pt-4">
          <p className="text-sm font-medium text-stone-800">New note</p>
          {uniqueSkus.length > 1 ? (
            <label className="block space-y-1">
              <span className="text-xs text-stone-500">Primary product</span>
              <Select
                value={selectedSkuId}
                onChange={(e) => setSelectedSkuId(e.target.value)}
              >
                {uniqueSkus.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {resolveProductLineLabel({
                      sku_code: sku.sku_code,
                      sku_name: sku.name,
                    })}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {uniqueSkus.length === 0 ? (
            <p className="text-xs text-stone-500">
              This PO has no line items, so a note cannot be posted here.
            </p>
          ) : (
            <MentionInput
              value={noteDraft}
              onChange={setNoteDraft}
              profiles={profiles}
              multiline
              disabled={posting}
              submitting={posting}
              submitLabel={posting ? "Posting…" : "Post note"}
              onSubmit={() => void postNote()}
              placeholder="Write a status note… use @ to mention"
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/dashboard/status-updates"
              className="text-xs text-stone-500 hover:text-stone-800 hover:underline"
            >
              All status updates
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
