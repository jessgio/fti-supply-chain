"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MessageSquareReply, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MentionInput } from "@/components/status-updates/mention-input";
import { StatusUpdateEditDialog } from "@/components/status-updates/status-update-edit-dialog";
import { SkuProductLabel } from "@/components/status-updates/sku-product-label";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_STYLES,
  entityHref,
  extractMentionIds,
  formatStatusUpdateTime,
  renderMentionBody,
} from "@/lib/status-updates/utils";
import type {
  Profile,
  StatusUpdate,
  StatusUpdateEntityRef,
  StatusUpdateRelatedEntity,
  StatusUpdateReply,
  UserRole,
} from "@/types/database";

interface StatusUpdateCardProps {
  update: StatusUpdate;
  profiles: Profile[];
  currentUserId?: string | null;
  currentUserRole?: UserRole | null;
  /** When set, product chips on the PO are shown in the group header instead. */
  poProductCount?: number;
  onReplyPosted?: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

function EntityTag({ ref: entityRef }: { ref: StatusUpdateEntityRef }) {
  const href = entityHref(
    entityRef.entity_type,
    entityRef.entity_id,
    entityRef.entity_label,
  );
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge
        className={
          ENTITY_TYPE_STYLES[entityRef.entity_type] ?? "bg-stone-100"
        }
      >
        {ENTITY_TYPE_LABELS[entityRef.entity_type] ?? entityRef.entity_type}
      </Badge>
      {href ? (
        <Link
          href={href}
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          {entityRef.entity_label ?? entityRef.entity_id}
        </Link>
      ) : (
        <span className="text-sm font-medium text-stone-800">
          {entityRef.entity_label ?? entityRef.entity_id}
        </span>
      )}
    </span>
  );
}

export function StatusUpdateCard({
  update,
  profiles,
  currentUserId,
  currentUserRole,
  poProductCount,
  onReplyPosted,
  onUpdated,
  onDeleted,
}: StatusUpdateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replies, setReplies] = useState<StatusUpdateReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [mentionRecords, setMentionRecords] = useState<
    StatusUpdateRelatedEntity[]
  >([]);

  const profileNames = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name ?? "User"])),
    [profiles],
  );

  const entityTags = useMemo(() => {
    const connected = update.connected_refs ?? [];
    if (update.entity_type === "po") {
      return connected;
    }
    const primary: StatusUpdateEntityRef = {
      entity_type: update.entity_type,
      entity_id: update.entity_id,
      entity_label: update.entity_label,
    };
    return connected.length > 0 ? [primary, ...connected] : [primary];
  }, [update]);

  const loadReplies = useCallback(async () => {
    setLoadingReplies(true);
    try {
      const res = await fetch(`/api/status-updates/${update.id}/replies`);
      const data = await res.json();
      if (res.ok) setReplies(data.replies ?? []);
    } finally {
      setLoadingReplies(false);
    }
  }, [update.id]);

  useEffect(() => {
    if (expanded) void loadReplies();
  }, [expanded, loadReplies]);

  const mentionRecordsSeed = useMemo(() => {
    const linkedPoIds = (update.connected_refs ?? [])
      .filter(
        (ref) =>
          ref.entity_type === "po" && ref.entity_id !== update.entity_id,
      )
      .map((ref) => ref.entity_id)
      .sort()
      .join(",");
    return `${update.sku_id}:${update.entity_id}:${linkedPoIds}`;
  }, [update.sku_id, update.entity_id, update.connected_refs]);

  useEffect(() => {
    let active = true;
    async function loadMentionRecords() {
      try {
        const res = await fetch(
          `/api/status-updates/related-entities?sku_id=${update.sku_id}`,
        );
        const data = await res.json();
        if (!active || !res.ok) return;
        setMentionRecords(
          [
            ...(data.entities ?? []).filter((entity: StatusUpdateRelatedEntity) =>
              ["po", "payment", "shipment"].includes(entity.entity_type),
            ),
            ...(update.connected_refs ?? [])
              .filter(
                (ref) =>
                  ref.entity_type === "po" && ref.entity_id !== update.entity_id,
              )
              .map((ref) => ({
                id: ref.entity_id,
                entity_type: "po" as const,
                label: ref.entity_label ?? ref.entity_id,
                sublabel: "Linked PO",
                status: null,
                date: null,
              })),
          ].filter(
            (entity, index, list) =>
              list.findIndex((entry) => entry.id === entity.id) === index,
          ),
        );
      } catch {
        if (active) setMentionRecords([]);
      }
    }
    void loadMentionRecords();
    return () => {
      active = false;
    };
  }, [mentionRecordsSeed]);

  async function postReply() {
    if (!replyDraft.trim() || postingReply) return;
    setPostingReply(true);
    try {
      const res = await fetch(`/api/status-updates/${update.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyDraft.trim(),
          mentioned_user_ids: extractMentionIds(replyDraft),
        }),
      });
      if (res.ok) {
        setReplyDraft("");
        await loadReplies();
        onReplyPosted?.();
      }
    } finally {
      setPostingReply(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this status update? Replies will be removed too. This cannot be undone.",
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/status-updates/${update.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete update");
      onDeleted?.();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete update",
      );
    } finally {
      setDeleting(false);
    }
  }

  const replyCount = update.reply_count ?? replies.length;

  const canModify =
    (currentUserId && update.author_id === currentUserId) ||
    currentUserRole === "admin" ||
    currentUserRole === "supply_chain";

  const wasEdited =
    update.updated_at &&
    new Date(update.updated_at).getTime() >
      new Date(update.created_at).getTime() + 1000;

  return (
    <>
    <article
      id={`status-update-${update.id}`}
      className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {entityTags.map((entityRef) => (
            <EntityTag
              key={`${entityRef.entity_type}:${entityRef.entity_id}`}
              ref={entityRef}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {canModify && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-stone-600"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </>
          )}
          <time
            className="text-xs text-stone-500"
            dateTime={update.created_at}
            title={new Date(update.created_at).toISOString()}
          >
            {formatStatusUpdateTime(update.created_at)}
            {wasEdited && update.updated_at ? (
              <span className="block text-[11px] text-stone-400">
                Edited {formatStatusUpdateTime(update.updated_at)}
              </span>
            ) : null}
          </time>
        </div>
      </div>

      <p className="mt-2 text-xs text-stone-500">
        {update.author_name ?? "User"}
        {update.author_id === currentUserId ? " (you)" : ""}
      </p>

      {(() => {
        const scopedProducts = update.associated_products ?? update.scoped_skus ?? [];
        const isPoGrouped = poProductCount != null;
        const coversWholePo =
          update.applies_to_all_po_products ||
          (isPoGrouped &&
            poProductCount > 0 &&
            scopedProducts.length === poProductCount);
        const showScope =
          scopedProducts.length > 0 &&
          (!isPoGrouped || !coversWholePo);

        if (!showScope) return null;

        return (
          <div className="mt-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              Applies to
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {scopedProducts.map((product) => (
                <li
                  key={product.sku_id}
                  className="rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-xs text-stone-700"
                >
                  <SkuProductLabel
                    sku_code={product.sku_code}
                    sku_name={product.sku_name}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      <div className="mt-2 whitespace-pre-wrap text-sm text-stone-900">
        {renderMentionBody(update.body, profileNames)}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-emerald-700"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <MessageSquareReply className="h-4 w-4" />
        {replyCount > 0
          ? `${replyCount} repl${replyCount === 1 ? "y" : "ies"}`
          : "Reply"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          {loadingReplies && replies.length === 0 && (
            <p className="text-sm text-stone-500">Loading replies…</p>
          )}
          {replies.map((reply) => (
            <div
              key={reply.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                reply.author_id === currentUserId
                  ? "ml-6 bg-emerald-50 text-stone-900"
                  : "mr-6 bg-stone-50 text-stone-900"
              }`}
            >
              <p className="text-xs text-stone-500">
                {reply.author_name ?? "User"} ·{" "}
                {formatStatusUpdateTime(reply.created_at)}
              </p>
              <div className="mt-1 whitespace-pre-wrap">
                {renderMentionBody(reply.body, profileNames)}
              </div>
            </div>
          ))}
          <MentionInput
            value={replyDraft}
            onChange={setReplyDraft}
            profiles={profiles}
            recordEntities={mentionRecords}
            poSearchExcludeId={
              update.entity_type === "po" ? update.entity_id : undefined
            }
            placeholder="Reply… use @ for people, POs, shipments, or payments"
            onSubmit={postReply}
            submitLabel="Reply"
            submitting={postingReply}
          />
        </div>
      )}
    </article>

    {canModify && (
      <StatusUpdateEditDialog
        update={update}
        profiles={profiles}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => onUpdated?.()}
      />
    )}
    </>
  );
}
