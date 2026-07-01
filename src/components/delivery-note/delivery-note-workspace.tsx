"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  PackagingSearchInput,
  type PackagingSearchOption,
} from "@/components/delivery-note/packaging-search-input";
import { formatNumber } from "@/lib/utils";
import type { DeliveryNote, PurchaseOrder, Supplier } from "@/types/database";

interface LineDraft {
  key: string;
  item: PackagingSearchOption | null;
  cartons: string;
  pcsPerCarton: string;
}

interface BootstrapData {
  supplier: Supplier;
  pos: Pick<PurchaseOrder, "id" | "po_number" | "status" | "order_date">[];
  packagingItems: PackagingSearchOption[];
}

interface DeliveryNoteWorkspaceProps {
  token: string;
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

export function DeliveryNoteWorkspace({ token }: DeliveryNoteWorkspaceProps) {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [poId, setPoId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [recipientName, setRecipientName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bootstrapRes, notesRes] = await Promise.all([
        fetch(`/api/delivery-note/${token}/bootstrap`),
        fetch(`/api/delivery-note/${token}/notes`),
      ]);
      const bootstrapJson = await bootstrapRes.json();
      const notesJson = await notesRes.json();
      if (!bootstrapRes.ok) throw new Error(bootstrapJson.error ?? "Failed to load form.");
      if (!notesRes.ok) throw new Error(notesJson.error ?? "Failed to load history.");
      setBootstrap(bootstrapJson);
      setNotes(notesJson.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load delivery note form.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const lineTotals = useMemo(
    () =>
      lines.map((line) => {
        const cartons = Number(line.cartons);
        const pcs = Number(line.pcsPerCarton);
        if (!Number.isFinite(cartons) || !Number.isFinite(pcs) || cartons <= 0 || pcs <= 0) {
          return null;
        }
        return cartons * pcs;
      }),
    [lines],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
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

      const res = await fetch(`/api/delivery-note/${token}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save delivery note.");

      setNotes((prev) => [json.note, ...prev]);
      setPoId("");
      setDeliveryDate(todayIso());
      setRecipientName("");
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
        Loading delivery note form…
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-600">
          {error ?? "This delivery note link is invalid."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Delivery Note</h1>
        <p className="mt-1 text-sm text-stone-600">
          Create a delivery note for shipments from {bootstrap.supplier.name} to Cosmax.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Shipment details</CardTitle>
            <CardDescription>
              Select an open PO, set the delivery date, and name the recipient (Penerima).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-stone-700">PO number</span>
              <Select value={poId} onChange={(e) => setPoId(e.target.value)} required>
                <option value="">Select PO…</option>
                {bootstrap.pos.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_number}
                  </option>
                ))}
              </Select>
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
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-stone-700">Penerima (recipient name)</span>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Recipient name"
                required
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
            <CardDescription>
              Search secondary packaging items by 12-digit code or product name.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border border-stone-200 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              >
                <label className="flex flex-col gap-1.5 text-sm md:col-span-1">
                  <span className="font-medium text-stone-700">Product</span>
                  <PackagingSearchInput
                    options={bootstrap.packagingItems}
                    value={line.item}
                    onChange={(item) => updateLine(line.key, { item })}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Cartons</span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={line.cartons}
                    onChange={(e) => updateLine(line.key, { cartons: e.target.value })}
                    required={Boolean(line.item)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Pcs / carton</span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={line.pcsPerCarton}
                    onChange={(e) => updateLine(line.key, { pcsPerCarton: e.target.value })}
                    required={Boolean(line.item)}
                  />
                </label>
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Total pcs</span>
                  <div className="flex h-10 items-center rounded-md border border-stone-200 bg-stone-50 px-3 font-mono text-sm">
                    {lineTotals[index] != null ? formatNumber(lineTotals[index]!) : "—"}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
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

        <Button type="submit" disabled={saving} className="self-start">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Create delivery note"
          )}
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Previously submitted delivery notes. Download the PDF as many times as needed.
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
                      <td className="py-3 pr-4">{note.po_number}</td>
                      <td className="py-3 pr-4">{note.delivery_date}</td>
                      <td className="py-3 pr-4">{note.recipient_name}</td>
                      <td className="py-3">
                        <a
                          href={`/api/delivery-note/${token}/notes/${note.id}/pdf`}
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
