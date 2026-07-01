"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileDown, FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PoSelectInput } from "@/components/extract-inbound-delivery-note/po-select-input";
import {
  ExtractSearchInput,
  type ExtractSearchOption,
} from "@/components/extract-inbound-delivery-note/extract-search-input";
import { formatNumber } from "@/lib/utils";
import type { ExtractInboundDeliveryNote, ExtractInboundPoOption } from "@/types/database";

interface LineDraft {
  key: string;
  item: ExtractSearchOption | null;
  quantity: string;
  uomKg: string;
}

interface BootstrapData {
  pos: ExtractInboundPoOption[];
  extractCodes: ExtractSearchOption[];
  defaultRecipient: string;
}

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    item: null,
    quantity: "",
    uomKg: "",
  };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ExtractInboundDnWorkspace() {
  const searchParams = useSearchParams();
  const preselectedPoId = searchParams.get("po") ?? "";

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [notes, setNotes] = useState<ExtractInboundDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [poId, setPoId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [recipientName, setRecipientName] = useState("");
  const [specialInstruction, setSpecialInstruction] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bootstrapRes, notesRes] = await Promise.all([
        fetch("/api/extract-inbound-delivery-notes/bootstrap"),
        fetch("/api/extract-inbound-delivery-notes"),
      ]);
      const bootstrapJson = await bootstrapRes.json();
      const notesJson = await notesRes.json();
      if (!bootstrapRes.ok) throw new Error(bootstrapJson.error ?? "Failed to load form.");
      if (!notesRes.ok) throw new Error(notesJson.error ?? "Failed to load history.");
      setBootstrap(bootstrapJson);
      setNotes(notesJson.notes ?? []);
      setRecipientName((prev) => prev || bootstrapJson.defaultRecipient || "");
      if (preselectedPoId) {
        setPoId(preselectedPoId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load form.");
    } finally {
      setLoading(false);
    }
  }, [preselectedPoId]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineTotals = useMemo(
    () =>
      lines.map((line) => {
        const qty = Number(line.quantity);
        const uom = Number(line.uomKg);
        if (!Number.isFinite(qty) || !Number.isFinite(uom) || qty <= 0 || uom <= 0) {
          return null;
        }
        return qty * uom;
      }),
    [lines],
  );

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
        special_instruction: specialInstruction.trim() || null,
        lines: lines
          .filter((line) => line.item)
          .map((line) => ({
            extract_code_id: line.item!.id,
            quantity: Number(line.quantity),
            uom_kg: Number(line.uomKg),
          })),
      };

      const res = await fetch("/api/extract-inbound-delivery-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save delivery note.");

      setNotes((prev) => [json.note, ...prev]);
      setPoId("");
      setDeliveryDate(todayIso());
      setRecipientName(bootstrap?.defaultRecipient ?? "");
      setSpecialInstruction("");
      setLines([emptyLine()]);
      setSuccess(`Delivery note ${json.note.dn_number} created. You can download the PDF below.`);
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
        Loading extract inbound delivery note form…
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-600">
          {error ?? "Failed to load form data."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>New extract inbound delivery note</CardTitle>
            <CardDescription>
              Ship extract from FTI to the manufacturer. Select the related PO, enter extract
              details, and generate a PDF for signing.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-stone-700">Purchase order</span>
              <PoSelectInput
                options={bootstrap.pos}
                value={poId}
                onChange={setPoId}
              />
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
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-stone-700">Special instruction (optional)</span>
              <Input
                value={specialInstruction}
                onChange={(e) => setSpecialInstruction(e.target.value)}
                placeholder="e.g. Mohon bantuannya untuk menyimpan di cold room"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
            <CardDescription>
              Type the extract name to look up its code. Quantity × UOM (kg) = total kg.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {bootstrap.extractCodes.length === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No extract codes loaded.{" "}
                <Link
                  href="/dashboard/extract-inbound-delivery-notes/codes"
                  className="font-medium underline"
                >
                  Upload the Extract Code catalog
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
                  <span className="font-medium text-stone-700">Extract name</span>
                  <ExtractSearchInput
                    options={bootstrap.extractCodes}
                    value={line.item}
                    onChange={(item) => updateLine(line.key, { item })}
                    disabled={bootstrap.extractCodes.length === 0}
                  />
                </label>
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Kode barang</span>
                  <div className="flex h-10 items-center rounded-md border border-stone-200 bg-stone-50 px-3 font-mono text-xs">
                    {line.item?.item_code ?? "—"}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Jumlah</span>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    required={Boolean(line.item)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">UOM (kg)</span>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={line.uomKg}
                    onChange={(e) => updateLine(line.key, { uomKg: e.target.value })}
                    placeholder="25"
                    required={Boolean(line.item)}
                  />
                </label>
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Total (kg)</span>
                  <div className="flex h-10 items-center rounded-md border border-stone-200 bg-stone-50 px-3 font-medium text-sm">
                    {lineTotals[idx] != null ? `${formatNumber(lineTotals[idx]!)} Kg` : "—"}
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

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || bootstrap.extractCodes.length === 0}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Create delivery note"
            )}
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Previously created extract inbound delivery notes. Download the PDF as needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="text-sm text-stone-500">No delivery notes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-4 font-medium">DN number</th>
                    <th className="py-2 pr-4 font-medium">PO</th>
                    <th className="py-2 pr-4 font-medium">Delivery date</th>
                    <th className="py-2 pr-4 font-medium">Penerima</th>
                    <th className="py-2 font-medium">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note) => (
                    <tr key={note.id} className="border-b border-stone-100">
                      <td className="py-3 pr-4 font-mono text-xs">{note.dn_number}</td>
                      <td className="py-3 pr-4">
                        {note.po_id ? (
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
                        <a
                          href={`/api/extract-inbound-delivery-notes/${note.id}/pdf`}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                        >
                          <FileDown className="h-4 w-4" />
                          Download
                        </a>
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
  );
}
