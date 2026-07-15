"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PoSelectInput } from "@/components/extract-inbound-delivery-note/po-select-input";
import {
  PackagingSearchInput,
  type PackagingSearchOption,
} from "@/components/delivery-note/packaging-search-input";
import { formatNumber } from "@/lib/utils";
import type { ExtractInboundPoOption } from "@/types/database";

interface LineDraft {
  key: string;
  item: PackagingSearchOption | null;
  cartons: string;
  pcsPerCarton: string;
}

interface NoteLine {
  packaging_item_id: string | null;
  item_code: string;
  product_name: string;
  cartons: number;
  pcs_per_carton: number;
}

interface NoteRecord {
  id: string;
  dn_number: string;
  po_id: string | null;
  po_number: string;
  delivery_date: string;
  recipient_name: string;
  lines?: NoteLine[];
}

interface BootstrapData {
  pos: ExtractInboundPoOption[];
  packagingItems: PackagingSearchOption[];
  defaultRecipient?: string;
  supplier?: { name: string };
}

export interface PackagingDnApiConfig {
  bootstrapUrl: string;
  notesUrl: string;
  noteUrl: (id: string) => string;
  pdfUrl: (id: string) => string;
}

export interface PackagingDnWorkspaceLabels {
  loadingMessage: string;
  emptyBootstrapMessage: string;
  formTitleNew: string;
  formTitleEdit: string;
  formDescription: string;
  lineItemsDescription: string;
  historyDescription: string;
  catalogHref?: string;
  catalogLinkLabel?: string;
}

export interface PackagingDnWorkspaceProps {
  api: PackagingDnApiConfig;
  labels: PackagingDnWorkspaceLabels;
  initialEditNoteId?: string;
  returnTo?: string;
  preselectedPoId?: string;
  /** Portal-only page chrome when not editing from dashboard. */
  showPortalTitle?: boolean;
  /** Link PO numbers in history to procurement (dashboard only). */
  linkPosInHistory?: boolean;
}

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    item: null,
    cartons: "",
    pcsPerCarton: "",
  };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resetFormState(defaultRecipient: string) {
  return {
    poId: "",
    deliveryDate: todayIso(),
    recipientName: defaultRecipient,
    lines: [emptyLine()],
  };
}

function lineDraftFromNoteLine(
  line: NoteLine,
  packagingItems: PackagingSearchOption[],
): LineDraft {
  const item =
    packagingItems.find((option) => option.id === line.packaging_item_id) ??
    (line.packaging_item_id
      ? {
          id: line.packaging_item_id,
          item_code: line.item_code,
          product_name: line.product_name,
        }
      : null);

  return {
    key: crypto.randomUUID(),
    item,
    cartons: String(line.cartons),
    pcsPerCarton: String(line.pcs_per_carton),
  };
}

export function PackagingDnWorkspace({
  api,
  labels,
  initialEditNoteId,
  returnTo,
  preselectedPoId = "",
  showPortalTitle = false,
  linkPosInHistory = false,
}: PackagingDnWorkspaceProps) {
  const router = useRouter();

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [poId, setPoId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [recipientName, setRecipientName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteNumber, setEditingNoteNumber] = useState<string | null>(null);
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const initialEditHandled = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bootstrapRes, notesRes] = await Promise.all([
        fetch(api.bootstrapUrl),
        fetch(api.notesUrl),
      ]);
      const bootstrapJson = await bootstrapRes.json();
      const notesJson = await notesRes.json();
      if (!bootstrapRes.ok) throw new Error(bootstrapJson.error ?? "Failed to load form.");
      if (!notesRes.ok) throw new Error(notesJson.error ?? "Failed to load history.");
      setBootstrap(bootstrapJson);
      setNotes(notesJson.notes ?? []);
      setRecipientName((prev) => prev || bootstrapJson.defaultRecipient || "");
      if (preselectedPoId && !initialEditNoteId) {
        setPoId(preselectedPoId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load form.");
    } finally {
      setLoading(false);
    }
  }, [api.bootstrapUrl, api.notesUrl, preselectedPoId, initialEditNoteId]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialEditHandled.current || loading || !bootstrap || !initialEditNoteId) {
      return;
    }
    initialEditHandled.current = true;
    void startEdit(initialEditNoteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bootstrap, initialEditNoteId]);

  const poOptions = useMemo(() => {
    if (!bootstrap) return [];
    const options = [...bootstrap.pos];
    if (poId && !options.some((po) => po.id === poId)) {
      const note = notes.find((entry) => entry.po_id === poId);
      if (note?.po_number) {
        options.unshift({
          id: poId,
          po_number: note.po_number,
          status: "received",
          order_date: note.delivery_date,
          sku_names: [],
        });
      }
    }
    return options;
  }, [bootstrap, notes, poId]);

  const packagingOptions = useMemo(() => {
    if (!bootstrap) return [];
    const options = [...bootstrap.packagingItems];
    for (const line of lines) {
      if (!line.item || options.some((option) => option.id === line.item!.id)) continue;
      options.push(line.item);
    }
    return options;
  }, [bootstrap, lines]);

  const lineTotals = useMemo(
    () =>
      lines.map((line) => {
        const cartons = Number(line.cartons);
        const pcs = Number(line.pcsPerCarton);
        if (
          !Number.isInteger(cartons) ||
          !Number.isInteger(pcs) ||
          cartons <= 0 ||
          pcs <= 0
        ) {
          return null;
        }
        return cartons * pcs;
      }),
    [lines],
  );

  function cancelEdit() {
    const reset = resetFormState(bootstrap?.defaultRecipient ?? "");
    setEditingNoteId(null);
    setEditingNoteNumber(null);
    setPoId(reset.poId);
    setDeliveryDate(reset.deliveryDate);
    setRecipientName(reset.recipientName);
    setLines(reset.lines);
    setError(null);
    setSuccess(null);
    if (returnTo) {
      router.push(returnTo);
    }
  }

  async function startEdit(noteId: string) {
    setLoadingNoteId(noteId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(api.noteUrl(noteId));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load delivery note.");

      const note = json.note as NoteRecord;
      if (!note.lines?.length) {
        throw new Error("This delivery note has no line items to edit.");
      }

      setEditingNoteId(note.id);
      setEditingNoteNumber(note.dn_number);
      setPoId(note.po_id ?? "");
      setDeliveryDate(note.delivery_date);
      setRecipientName(note.recipient_name);
      setLines(
        note.lines.map((line) =>
          lineDraftFromNoteLine(line, bootstrap?.packagingItems ?? []),
        ),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load delivery note.");
    } finally {
      setLoadingNoteId(null);
    }
  }

  async function handleDelete(noteId: string, dnNumber: string) {
    if (!confirm(`Delete delivery note ${dnNumber}? This cannot be undone.`)) {
      return;
    }

    setDeletingNoteId(noteId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(api.noteUrl(noteId), { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete delivery note.");

      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      if (editingNoteId === noteId) {
        cancelEdit();
      }
      setSuccess(`Delivery note ${dnNumber} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete delivery note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!poId) {
        throw new Error("Select a purchase order.");
      }
      const payload = {
        po_id: poId,
        delivery_date: deliveryDate,
        recipient_name: recipientName.trim(),
        lines: lines
          .filter((line) => line.item)
          .map((line) => ({
            packaging_item_id: line.item!.id,
            cartons: Number(line.cartons),
            pcs_per_carton: Number(line.pcsPerCarton),
          })),
      };

      const url = editingNoteId ? api.noteUrl(editingNoteId) : api.notesUrl;
      const res = await fetch(url, {
        method: editingNoteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save delivery note.");

      if (editingNoteId) {
        setNotes((prev) =>
          prev.map((note) => (note.id === editingNoteId ? json.note : note)),
        );
        if (returnTo) {
          router.push(returnTo);
          return;
        }
        cancelEdit();
        setSuccess(
          `Delivery note ${json.note.dn_number} updated. You can download the PDF below.`,
        );
      } else {
        setNotes((prev) => [json.note, ...prev]);
        const reset = resetFormState(bootstrap?.defaultRecipient ?? "");
        setPoId(reset.poId);
        setDeliveryDate(reset.deliveryDate);
        setRecipientName(reset.recipientName);
        setLines(reset.lines);
        setSuccess(
          `Delivery note ${json.note.dn_number} created. You can download the PDF below.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save delivery note.");
    } finally {
      setSaving(false);
    }
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {labels.loadingMessage}
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-600">
          {error ?? labels.emptyBootstrapMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {showPortalTitle && !returnTo && (
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Secondary Packaging Inbound
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {editingNoteId
              ? `Editing ${editingNoteNumber}. Update the form below and save your changes.`
              : `Create a delivery note for shipments from ${bootstrap.supplier?.name ?? "supplier"} to Cosmax.`}
          </p>
        </div>
      )}

      {editingNoteId && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {editingNoteNumber
            ? `Editing ${editingNoteNumber}. Update the form below and save your changes.`
            : "Editing delivery note. Update the form below and save your changes."}
        </p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {editingNoteId ? labels.formTitleEdit : labels.formTitleNew}
            </CardTitle>
            <CardDescription>{labels.formDescription}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-stone-700">Purchase order</span>
              <PoSelectInput options={poOptions} value={poId} onChange={setPoId} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-stone-700">Delivery date</span>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-stone-700">Penerima (recipient PIC)</span>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. Pak Erwin Hadi"
                required
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
            <CardDescription>{labels.lineItemsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {packagingOptions.length === 0 && labels.catalogHref && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No catalog items loaded.{" "}
                <Link href={labels.catalogHref} className="font-medium underline">
                  {labels.catalogLinkLabel ?? "Open catalog"}
                </Link>{" "}
                first.
              </p>
            )}

            {lines.map((line, idx) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border border-stone-200 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
              >
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Product</span>
                  <PackagingSearchInput
                    options={packagingOptions}
                    value={line.item}
                    onChange={(item) => updateLine(line.key, { item })}
                    disabled={packagingOptions.length === 0}
                  />
                </label>
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Item code</span>
                  <div className="flex h-10 items-center rounded-md border border-stone-200 bg-stone-50 px-3 font-mono text-xs">
                    {line.item?.item_code ?? "—"}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Cartons</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={line.cartons}
                    onChange={(e) => updateLine(line.key, { cartons: e.target.value })}
                    required={Boolean(line.item)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Pcs / carton</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={line.pcsPerCarton}
                    onChange={(e) => updateLine(line.key, { pcsPerCarton: e.target.value })}
                    required={Boolean(line.item)}
                  />
                </label>
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Total pcs</span>
                  <div className="flex h-10 items-center rounded-md border border-stone-200 bg-stone-50 px-3 text-sm font-medium">
                    {lineTotals[idx] != null ? formatNumber(lineTotals[idx]!) : "—"}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((prev) =>
                        prev.length > 1
                          ? prev.filter((l) => l.key !== line.key)
                          : [emptyLine()],
                      )
                    }
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4 text-stone-400" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add line
            </Button>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-700">{success}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          {editingNoteId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              Cancel edit
            </Button>
          )}
          <Button type="submit" disabled={saving || packagingOptions.length === 0}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : editingNoteId ? (
              "Save changes"
            ) : (
              "Create delivery note"
            )}
          </Button>
        </div>
      </form>

      {!initialEditNoteId && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>{labels.historyDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <p className="text-sm text-stone-500">No delivery notes yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2 pr-4 font-medium">DN number</th>
                      <th className="py-2 pr-4 font-medium">PO</th>
                      <th className="py-2 pr-4 font-medium">Delivery date</th>
                      <th className="py-2 pr-4 font-medium">Penerima</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((note) => (
                      <tr key={note.id} className="border-b border-stone-100">
                        <td className="py-3 pr-4 font-mono text-xs">{note.dn_number}</td>
                        <td className="py-3 pr-4">
                          {linkPosInHistory && note.po_id ? (
                            <Link
                              href={`/dashboard/procurement/${note.po_id}`}
                              className="text-emerald-700 hover:underline"
                            >
                              {note.po_number}
                            </Link>
                          ) : (
                            note.po_number
                          )}
                        </td>
                        <td className="py-3 pr-4">{note.delivery_date}</td>
                        <td className="py-3 pr-4">{note.recipient_name}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void startEdit(note.id)}
                              disabled={loadingNoteId === note.id}
                              className="inline-flex items-center gap-1 text-stone-700 hover:underline disabled:opacity-50"
                            >
                              {loadingNoteId === note.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                              Edit
                            </button>
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
                              href={api.pdfUrl(note.id)}
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
      )}
    </div>
  );
}
