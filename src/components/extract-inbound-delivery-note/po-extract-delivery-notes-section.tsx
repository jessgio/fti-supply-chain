"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExtractInboundDeliveryNote } from "@/types/database";

interface PoExtractDeliveryNotesSectionProps {
  poId: string;
}

export function PoExtractDeliveryNotesSection({ poId }: PoExtractDeliveryNotesSectionProps) {
  const [notes, setNotes] = useState<ExtractInboundDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/extract-inbound-delivery-notes/by-po/${poId}`);
      const data = await res.json();
      if (res.ok) {
        setNotes(data.notes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(noteId: string, dnNumber: string) {
    if (!confirm(`Delete delivery note ${dnNumber}? This cannot be undone.`)) {
      return;
    }

    setDeletingNoteId(noteId);
    setError(null);
    try {
      const res = await fetch(`/api/extract-inbound-delivery-notes/${noteId}`, {
        method: "DELETE",
      });
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Extract Inbound</CardTitle>
          <CardDescription>
            Delivery notes for shipping extract to the manufacturer linked to this PO.
          </CardDescription>
        </div>
        <Link href={`/dashboard/extract-inbound-delivery-notes?po=${poId}`}>
          <Button type="button" size="sm" variant="outline">
            <Plus className="mr-2 h-3.5 w-3.5" />
            New note
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {loading ? (
          <div className="flex items-center text-sm text-stone-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-stone-500">No extract delivery notes for this PO yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="py-2 pr-4 font-medium">DN number</th>
                  <th className="py-2 pr-4 font-medium">Delivery date</th>
                  <th className="py-2 pr-4 font-medium">Penerima</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.id} className="border-b border-stone-100">
                    <td className="py-2 pr-4 font-mono text-xs">{note.dn_number}</td>
                    <td className="py-2 pr-4">{note.delivery_date}</td>
                    <td className="py-2 pr-4">{note.recipient_name}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/dashboard/extract-inbound-delivery-notes/${note.id}/edit`}
                          className="inline-flex items-center gap-1 text-stone-700 hover:underline"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(note.id, note.dn_number)}
                          disabled={deletingNoteId === note.id}
                          className="inline-flex items-center gap-1 text-red-700 hover:underline disabled:opacity-50"
                        >
                          {deletingNoteId === note.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                        <a
                          href={`/api/extract-inbound-delivery-notes/${note.id}/pdf`}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                        >
                          <FileDown className="h-3.5 w-3.5" />
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
  );
}
