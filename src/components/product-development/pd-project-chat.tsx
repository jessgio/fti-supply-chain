"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PdChatMessage, Profile } from "@/types/database";

interface PdProjectChatProps {
  projectId: string;
  profiles: Profile[];
  currentUserId?: string | null;
}

function renderMessageBody(
  body: string,
  profiles: Profile[],
): React.ReactNode {
  const profileMap = new Map(
    profiles.map((p) => [p.id, p.full_name ?? "User"]),
  );
  const parts = body.split(/(@\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      const name = profileMap.get(match[2]) ?? match[1];
      return (
        <span key={i} className="font-medium text-emerald-700">
          @{name}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function PdProjectChat({
  projectId,
  profiles,
  currentUserId,
}: PdProjectChatProps) {
  const [messages, setMessages] = useState<PdChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(
      `/api/product-development/projects/${projectId}/chat`,
    );
    const data = await res.json();
    if (res.ok) setMessages(data.messages ?? []);
  }, [projectId]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mentionCandidates = mentionQuery !== null
    ? profiles.filter((p) => {
        const name = (p.full_name ?? "").toLowerCase();
        return name.includes(mentionQuery.toLowerCase());
      }).slice(0, 6)
    : [];

  function handleInputChange(value: string) {
    setDraft(value);
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(profile: Profile) {
    const cursor = inputRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const atIndex = before.lastIndexOf("@");
    const name = profile.full_name ?? "User";
    const mention = `@[${name}](${profile.id})`;
    const next = `${before.slice(0, atIndex)}${mention} ${after}`;
    setDraft(next);
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  async function sendMessage() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const mentionedIds = [...draft.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)].map(
        (m) => m[1],
      );
      const res = await fetch(
        `/api/product-development/projects/${projectId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: draft.trim(),
            mentioned_user_ids: mentionedIds,
          }),
        },
      );
      if (res.ok) {
        setDraft("");
        await loadMessages();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[28rem] flex-col rounded-lg border border-stone-200 bg-white">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-stone-500">
            Start a conversation. Type @ to mention a team member.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-0.5 ${
              msg.author_id === currentUserId ? "items-end" : "items-start"
            }`}
          >
            <span className="text-xs text-stone-500">
              {msg.author_name ?? "User"} ·{" "}
              {new Date(msg.created_at).toLocaleString()}
            </span>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.author_id === currentUserId
                  ? "bg-emerald-700 text-white"
                  : "bg-stone-100 text-stone-900"
              }`}
            >
              {renderMessageBody(msg.body, profiles)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="relative border-t border-stone-200 p-3">
        {mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 rounded-md border border-stone-200 bg-white shadow-md">
            {mentionCandidates.map((profile, i) => (
              <button
                key={profile.id}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-stone-50 ${
                  i === mentionIndex ? "bg-emerald-50" : ""
                }`}
                onClick={() => insertMention(profile)}
              >
                {profile.full_name ?? profile.id}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
              if (mentionCandidates.length > 0 && e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) =>
                  Math.min(i + 1, mentionCandidates.length - 1),
                );
              }
              if (mentionCandidates.length > 0 && e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => Math.max(i - 1, 0));
              }
              if (mentionCandidates.length > 0 && e.key === "Tab") {
                e.preventDefault();
                insertMention(mentionCandidates[mentionIndex]);
              }
            }}
            placeholder="Write a message… use @ to mention"
            className={cn(
              "h-10 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600",
            )}
          />
          <Button onClick={sendMessage} disabled={sending || !draft.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
