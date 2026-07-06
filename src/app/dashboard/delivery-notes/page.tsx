"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, FileDown, Link2, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/dashboard/page-shell";
import type { DeliveryNote, DeliveryNotePortal } from "@/types/database";

export default function DeliveryNotesDashboardPage() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [portal, setPortal] = useState<DeliveryNotePortal | null>(null);
  const [customToken, setCustomToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [settingToken, setSettingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesRes, portalRes] = await Promise.all([
        fetch("/api/delivery-notes"),
        fetch("/api/delivery-notes/portal"),
      ]);
      const notesJson = await notesRes.json();
      const portalJson = await portalRes.json();
      if (!notesRes.ok) throw new Error(notesJson.error ?? "Failed to load delivery notes.");
      if (!portalRes.ok) throw new Error(portalJson.error ?? "Failed to load portal link.");
      setNotes(notesJson.notes ?? []);
      setPortal(portalJson.portal ?? null);
      if (portalJson.portal?.access_token) {
        setCustomToken(portalJson.portal.access_token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load delivery notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const portalUrl =
    portal && typeof window !== "undefined"
      ? `${window.location.origin}/delivery-note/${portal.access_token}`
      : null;

  async function regenerateLink() {
    if (!confirm("Regenerate the external link? The previous link will stop working immediately.")) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch("/api/delivery-notes/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to regenerate link.");
      setPortal(json.portal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate link.");
    } finally {
      setRegenerating(false);
    }
  }

  async function copyLink() {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function setToken() {
    if (!customToken.trim()) return;
    setSettingToken(true);
    setError(null);
    try {
      const res = await fetch("/api/delivery-notes/portal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: customToken.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to set token.");
      setPortal(json.portal);
      setCustomToken(json.portal.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set token.");
    } finally {
      setSettingToken(false);
    }
  }

  async function handleDelete(noteId: string, dnNumber: string) {
    if (!confirm(`Delete delivery note ${dnNumber}? This cannot be undone.`)) {
      return;
    }

    setDeletingNoteId(noteId);
    setError(null);
    try {
      const res = await fetch(`/api/delivery-notes/${noteId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete delivery note.");
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete delivery note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  return (
    <PageShell className="max-w-4xl">
      <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Secondary Packaging Delivery Notes</h1>
          <p className="mt-1 text-sm text-stone-600">
            External delivery note submissions and PDF history for Cosmax inbound shipments.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            External portal link
          </CardTitle>
          <CardDescription>
            Share this link with the external party. They can create delivery notes and view
            history without logging in. The URL is{" "}
            <code className="rounded bg-stone-100 px-1">/delivery-note/[token]</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 truncate rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700">
              {portalUrl ?? "Loading…"}
            </code>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => void copyLink()} disabled={!portalUrl}>
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void regenerateLink()}
                disabled={regenerating}
              >
                {regenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Randomize
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <p className="mb-2 text-sm font-medium text-stone-700">Set a custom token</p>
            <p className="mb-3 text-xs text-stone-500">
              Use at least 16 characters (letters, numbers, hyphens, underscores). This becomes
              the token segment in the external URL.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="my-secure-portal-token"
                className="font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void setToken()}
                disabled={settingToken || customToken.trim().length < 16}
              >
                {settingToken ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Set token"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submission history</CardTitle>
          <CardDescription>
            All delivery notes created via the external portal. Edit or delete submissions as
            needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center text-stone-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-stone-500">No delivery notes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4 font-medium">DN number</th>
                    <th className="py-2 pr-4 font-medium">PO</th>
                    <th className="py-2 pr-4 font-medium">Supplier</th>
                    <th className="py-2 pr-4 font-medium">Delivery date</th>
                    <th className="py-2 pr-4 font-medium">Penerima</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note) => (
                    <tr key={note.id} className="border-b border-stone-100">
                      <td className="py-3 pr-4 font-mono text-xs">{note.dn_number}</td>
                      <td className="py-3 pr-4">{note.po_number}</td>
                      <td className="py-3 pr-4">{note.supplier_name ?? "—"}</td>
                      <td className="py-3 pr-4">{note.delivery_date}</td>
                      <td className="py-3 pr-4">{note.recipient_name}</td>
                      <td className="py-3 pr-4 text-stone-500">
                        {note.created_at
                          ? new Date(note.created_at).toLocaleString("en-GB")
                          : "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            href={`/dashboard/delivery-notes/${note.id}/edit`}
                            className="inline-flex items-center gap-1 text-stone-700 hover:underline"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleDelete(note.id, note.dn_number)}
                            disabled={deletingNoteId === note.id}
                            className="inline-flex items-center gap-1 text-red-700 hover:underline disabled:opacity-50"
                          >
                            {deletingNoteId === note.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Delete
                          </button>
                          <a
                            href={`/api/delivery-notes/${note.id}/pdf`}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                          >
                            <FileDown className="h-4 w-4" />
                            Download
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PageShell>
  );
}
