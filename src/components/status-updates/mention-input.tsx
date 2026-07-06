"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  formatRecordMention,
  mentionRecordSearchHaystack,
  recordMentionLabel,
} from "@/lib/status-updates/utils";
import { cn } from "@/lib/utils";
import type { Profile, StatusUpdateRelatedEntity } from "@/types/database";

type MentionCandidate =
  | { kind: "user"; profile: Profile }
  | { kind: "record"; entity: StatusUpdateRelatedEntity };

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  profiles: Profile[];
  recordEntities?: StatusUpdateRelatedEntity[];
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  className?: string;
}

const RECORD_TYPE_ORDER = ["po", "payment", "shipment"] as const;

function recordTypeLabel(entityType: string): string {
  switch (entityType) {
    case "po":
      return "PO";
    case "payment":
      return "Payment";
    case "shipment":
      return "Shipment";
    default:
      return entityType;
  }
}

export function MentionInput({
  value,
  onChange,
  profiles,
  recordEntities = [],
  placeholder = "Write a note… use @ to mention",
  multiline = false,
  disabled = false,
  onSubmit,
  submitLabel = "Post",
  submitting = false,
  className,
}: MentionInputProps) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const mentionableRecords = useMemo(
    () =>
      recordEntities.filter((entity) =>
        RECORD_TYPE_ORDER.includes(
          entity.entity_type as (typeof RECORD_TYPE_ORDER)[number],
        ),
      ),
    [recordEntities],
  );

  const mentionCandidates = useMemo((): MentionCandidate[] => {
    if (mentionQuery === null) return [];

    const query = mentionQuery.toLowerCase();
    const records = mentionableRecords
      .filter((entity) => {
        if (!query) return true;
        return mentionRecordSearchHaystack(entity).includes(query);
      })
      .slice(0, 5)
      .map(
        (entity): MentionCandidate => ({
          kind: "record",
          entity,
        }),
      );

    const users = profiles
      .filter((profile) => {
        const name = (profile.full_name ?? "").toLowerCase();
        return !query || name.includes(query);
      })
      .slice(0, 5)
      .map(
        (profile): MentionCandidate => ({
          kind: "user",
          profile,
        }),
      );

    return [...records, ...users].slice(0, 8);
  }, [mentionQuery, mentionableRecords, profiles]);

  function handleInputChange(next: string) {
    onChange(next);
    const cursor = inputRef.current?.selectionStart ?? next.length;
    const before = next.slice(0, cursor);
    const atMatch = before.match(/@([^@\n[\]]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMentionText(mention: string) {
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const atIndex = before.lastIndexOf("@");
    const next = `${before.slice(0, atIndex)}${mention} ${after}`;
    onChange(next);
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  function insertCandidate(candidate: MentionCandidate) {
    if (candidate.kind === "user") {
      const name = candidate.profile.full_name ?? "User";
      insertMentionText(`@[${name}](${candidate.profile.id})`);
      return;
    }
    insertMentionText(formatRecordMention(candidate.entity));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && onSubmit && !multiline) {
      e.preventDefault();
      onSubmit();
    }
    if (mentionCandidates.length > 0 && e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((index) =>
        Math.min(index + 1, mentionCandidates.length - 1),
      );
    }
    if (mentionCandidates.length > 0 && e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((index) => Math.max(index - 1, 0));
    }
    if (mentionCandidates.length > 0 && e.key === "Tab") {
      e.preventDefault();
      insertCandidate(mentionCandidates[mentionIndex]);
    }
    if (mentionCandidates.length > 0 && e.key === "Enter" && multiline) {
      e.preventDefault();
      insertCandidate(mentionCandidates[mentionIndex]);
    }
  }

  const inputClassName = cn(
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600",
    multiline ? "min-h-[5rem] resize-y" : "h-10",
  );

  return (
    <div className={cn("relative", className)}>
      {mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-56 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-md">
          {mentionCandidates.map((candidate, index) => (
            <button
              key={
                candidate.kind === "user"
                  ? `user:${candidate.profile.id}`
                  : `record:${candidate.entity.entity_type}:${candidate.entity.id}`
              }
              type="button"
              className={cn(
                "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50",
                index === mentionIndex && "bg-emerald-50",
              )}
              onClick={() => insertCandidate(candidate)}
            >
              {candidate.kind === "user" ? (
                <>
                  <span className="mt-0.5 shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                    User
                  </span>
                  <span className="min-w-0 text-stone-900">
                    {candidate.profile.full_name ?? candidate.profile.id}
                  </span>
                </>
              ) : (
                <>
                  <span className="mt-0.5 shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                    {recordTypeLabel(candidate.entity.entity_type)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-stone-900">
                      {recordMentionLabel(candidate.entity)}
                    </span>
                    {candidate.entity.sublabel ? (
                      <span className="block truncate text-xs text-stone-500">
                        {candidate.entity.sublabel}
                      </span>
                    ) : null}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      <div className={cn("flex gap-2", multiline && "flex-col")}>
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={inputClassName}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={inputClassName}
          />
        )}
        {onSubmit && (
          <Button
            type="button"
            onClick={onSubmit}
            disabled={disabled || submitting || !value.trim()}
            className={multiline ? "self-end" : undefined}
          >
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
