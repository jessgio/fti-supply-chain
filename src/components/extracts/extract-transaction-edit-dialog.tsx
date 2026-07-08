"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EXTRACT_CATEGORY_LABELS,
  EXTRACT_CATEGORY_STYLES,
} from "@/lib/extracts/categories";
import { resolveActionCodeCategory } from "@/lib/extracts/mappings";
import { cn } from "@/lib/utils";
import type {
  ExtractActionCodeMapping,
  ExtractTransaction,
} from "@/types/database";

interface ExtractTransactionEditDialogProps {
  extractId: string;
  transaction: ExtractTransaction;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function parseNumeric(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

export function ExtractTransactionEditDialog({
  extractId,
  transaction,
  open,
  onClose,
  onSaved,
}: ExtractTransactionEditDialogProps) {
  const [txnDate, setTxnDate] = useState(transaction.txn_date);
  const [tranCode, setTranCode] = useState(transaction.tran_code ?? "");
  const [orderNo, setOrderNo] = useState(transaction.order_no ?? "");
  const [lotNo, setLotNo] = useState(transaction.lot_no ?? "");
  const [received, setReceived] = useState(String(transaction.received || ""));
  const [issued, setIssued] = useState(String(transaction.issued || ""));
  const [remark, setRemark] = useState(transaction.remark ?? "");
  const [actionCodes, setActionCodes] = useState<ExtractActionCodeMapping[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActionCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/extracts/mappings/action-codes");
      const data = await res.json();
      if (res.ok) setActionCodes(data.mappings ?? []);
    } catch {
      setActionCodes([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTxnDate(transaction.txn_date);
    setTranCode(transaction.tran_code ?? "");
    setOrderNo(transaction.order_no ?? "");
    setLotNo(transaction.lot_no ?? "");
    setReceived(String(transaction.received || ""));
    setIssued(String(transaction.issued || ""));
    setRemark(transaction.remark ?? "");
    setError(null);
    loadActionCodes();
  }, [open, transaction, loadActionCodes]);

  const category = useMemo(
    () => resolveActionCodeCategory(tranCode.trim() || null, actionCodes),
    [tranCode, actionCodes],
  );

  const codeOptions = useMemo(
    () =>
      [...actionCodes]
        .map((m) => m.action_code)
        .sort((a, b) => a.localeCompare(b)),
    [actionCodes],
  );

  async function handleSave() {
    if (!txnDate.trim()) {
      setError("Date is required.");
      return;
    }
    if (!tranCode.trim()) {
      setError("Action code is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/extracts/${extractId}/transactions/${transaction.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txn_date: txnDate,
            tran_code: tranCode.trim(),
            order_no: orderNo.trim() || null,
            lot_no: lotNo.trim() || null,
            received: parseNumeric(received),
            issued: parseNumeric(issued),
            remark: remark.trim() || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this ledger row? Running balances for later rows will be recalculated.",
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/extracts/${extractId}/transactions/${transaction.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit ledger row"
      description="Changes are merged into the master ledger by date. Running balances are recalculated automatically."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">
              Date
            </label>
            <Input
              type="date"
              value={txnDate}
              onChange={(e) => setTxnDate(e.target.value)}
              disabled={saving || deleting}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">
              Action code
            </label>
            <Input
              list="edit-extract-action-codes"
              value={tranCode}
              placeholder="e.g. QAC"
              onChange={(e) => setTranCode(e.target.value)}
              disabled={saving || deleting}
            />
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-stone-500">
            Category
          </span>
          {tranCode.trim() ? (
            <Badge
              className={cn(
                "text-xs font-normal",
                EXTRACT_CATEGORY_STYLES[category],
                category === "uncategorized" && "ring-1 ring-amber-400",
              )}
            >
              {EXTRACT_CATEGORY_LABELS[category]}
            </Badge>
          ) : (
            <span className="text-sm text-stone-400">—</span>
          )}
          {category === "uncategorized" && tranCode.trim() && (
            <p className="mt-1 text-xs text-amber-700">
              Unmapped —{" "}
              <Link href="/dashboard/extracts/mappings" className="underline">
                add code
              </Link>
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">
              Order no
            </label>
            <Input
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              disabled={saving || deleting}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">
              Lot no
            </label>
            <Input
              value={lotNo}
              onChange={(e) => setLotNo(e.target.value)}
              disabled={saving || deleting}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">
              Inbound (kg)
            </label>
            <Input
              type="number"
              min="0"
              step="any"
              className="text-right"
              value={received}
              placeholder="0"
              onChange={(e) => setReceived(e.target.value)}
              disabled={saving || deleting}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">
              Outbound (kg)
            </label>
            <Input
              type="number"
              min="0"
              step="any"
              className="text-right"
              value={issued}
              placeholder="0"
              onChange={(e) => setIssued(e.target.value)}
              disabled={saving || deleting}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">
            Remark
          </label>
          <Input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            disabled={saving || deleting}
          />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
          <Button
            type="button"
            variant="outline"
            className="text-rose-600 hover:bg-rose-50"
            onClick={handleDelete}
            disabled={saving || deleting}
          >
            {deleting ? "Deleting…" : "Delete row"}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving || deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <datalist id="edit-extract-action-codes">
        {codeOptions.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </Dialog>
  );
}
