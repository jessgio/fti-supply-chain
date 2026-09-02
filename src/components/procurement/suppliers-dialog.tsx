"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SupplierUsualTermsSummary,
  useSupplierUsualTerms,
} from "@/components/procurement/supplier-usual-terms-hint";
import { formatSupplierPoNotes } from "@/lib/procurement/supplier-po-notes";
import type { Supplier } from "@/types/database";

const TEXTAREA_CLASS =
  "min-h-[72px] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

interface SupplierFormState {
  name: string;
  address: string;
  picName: string;
  picEmail: string;
  picPhone: string;
  paymentTerms: string;
  leadTimeNote: string;
  deliveryTime: string;
  packagingNotes: string;
  beneficiaryName: string;
  beneficiaryAccountNumber: string;
  swiftCode: string;
  beneficiaryCountry: string;
  beneficiaryAddress: string;
  beneficiaryBank: string;
  beneficiaryBankAddress: string;
  bankCode: string;
  branchCode: string;
}

function supplierToForm(s: Supplier): SupplierFormState {
  return {
    name: s.name,
    address: s.address ?? "",
    picName: s.pic_name ?? "",
    picEmail: s.pic_email ?? "",
    picPhone: s.pic_phone ?? "",
    paymentTerms: s.payment_terms ?? "",
    leadTimeNote: s.lead_time_note ?? "",
    deliveryTime: s.delivery_time ?? "",
    packagingNotes: s.packaging_notes ?? "",
    beneficiaryName: s.beneficiary_name ?? "",
    beneficiaryAccountNumber: s.beneficiary_account_number ?? "",
    swiftCode: s.swift_code ?? "",
    beneficiaryCountry: s.beneficiary_country ?? "",
    beneficiaryAddress: s.beneficiary_address ?? "",
    beneficiaryBank: s.beneficiary_bank ?? "",
    beneficiaryBankAddress: s.beneficiary_bank_address ?? "",
    bankCode: s.bank_code ?? "",
    branchCode: s.branch_code ?? "",
  };
}

function formToSupplierPayload(form: SupplierFormState) {
  return {
    name: form.name.trim(),
    address: form.address || null,
    pic_name: form.picName || null,
    pic_email: form.picEmail || null,
    pic_phone: form.picPhone || null,
    payment_terms: form.paymentTerms || null,
    lead_time_note: form.leadTimeNote || null,
    delivery_time: form.deliveryTime || null,
    packaging_notes: form.packagingNotes || null,
    beneficiary_name: form.beneficiaryName || null,
    beneficiary_account_number: form.beneficiaryAccountNumber || null,
    swift_code: form.swiftCode || null,
    beneficiary_country: form.beneficiaryCountry || null,
    beneficiary_address: form.beneficiaryAddress || null,
    beneficiary_bank: form.beneficiaryBank || null,
    beneficiary_bank_address: form.beneficiaryBankAddress || null,
    bank_code: form.bankCode || null,
    branch_code: form.branchCode || null,
  };
}

function formToNotesPreview(form: SupplierFormState): string | null {
  return formatSupplierPoNotes({
    payment_terms: form.paymentTerms || null,
    lead_time_note: form.leadTimeNote || null,
    delivery_time: form.deliveryTime || null,
    packaging_notes: form.packagingNotes || null,
    beneficiary_name: form.beneficiaryName || null,
    beneficiary_account_number: form.beneficiaryAccountNumber || null,
    swift_code: form.swiftCode || null,
    beneficiary_country: form.beneficiaryCountry || null,
    beneficiary_address: form.beneficiaryAddress || null,
    beneficiary_bank: form.beneficiaryBank || null,
    beneficiary_bank_address: form.beneficiaryBankAddress || null,
    bank_code: form.bankCode || null,
    branch_code: form.branchCode || null,
  });
}

export function SuppliersDialog({
  suppliers,
  onClose,
  onUpdated,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onUpdated: (s: Supplier) => void;
  onCreated: (s: Supplier) => void;
}) {
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormState | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notesPreview = useMemo(
    () => (form ? formToNotesPreview(form) : null),
    [form],
  );
  const { terms: usualTerms } = useSupplierUsualTerms(editing?.id);

  function patchForm(patch: Partial<SupplierFormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function startEdit(s: Supplier) {
    setEditing(s);
    setForm(supplierToForm(s));
    setError(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onCreated(data.supplier);
      setNewName("");
      startEdit(data.supplier);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!editing || !form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/suppliers/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToSupplierPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onUpdated(data.supplier);
      setEditing(null);
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Suppliers"
      description="Address, PIC, payment terms, and banking details for PO printouts."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            className="flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New supplier name"
          />
          <Button
            variant="outline"
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
          >
            Add
          </Button>
        </div>

        <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200">
          {suppliers.length === 0 ? (
            <p className="p-4 text-sm text-stone-500">No suppliers yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50 ${
                      editing?.id === s.id ? "bg-emerald-50" : ""
                    }`}
                    onClick={() => startEdit(s)}
                  >
                    <span className="font-medium text-stone-900">{s.name}</span>
                    <span className="text-xs text-stone-500">
                      {s.address ? "Address set" : "No address"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {editing && form && (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto rounded-lg bg-stone-50 p-4">
            <p className="text-sm font-medium text-stone-800">
              Edit {editing.name}
            </p>
            <label className="block space-y-1">
              <span className="text-sm text-stone-600">Name</span>
              <Input
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-stone-600">Address</span>
              <Input
                value={form.address}
                onChange={(e) => patchForm({ address: e.target.value })}
                placeholder="Manufacturer address"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm text-stone-600">PIC name</span>
                <Input
                  value={form.picName}
                  onChange={(e) => patchForm({ picName: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-stone-600">PIC email</span>
                <Input
                  type="email"
                  value={form.picEmail}
                  onChange={(e) => patchForm({ picEmail: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-stone-600">PIC phone</span>
                <Input
                  value={form.picPhone}
                  onChange={(e) => patchForm({ picPhone: e.target.value })}
                />
              </label>
            </div>

            <div className="space-y-3 border-t border-stone-200 pt-4">
              <p className="text-sm font-medium text-stone-800">
                Term of payment
              </p>
              <SupplierUsualTermsSummary terms={usualTerms} />
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">1) Payment</span>
                <Input
                  value={form.paymentTerms}
                  onChange={(e) => patchForm({ paymentTerms: e.target.value })}
                  placeholder="30% deposit, 70% balance before shipping"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">2) Lead time</span>
                  <Input
                    value={form.leadTimeNote}
                    onChange={(e) =>
                      patchForm({ leadTimeNote: e.target.value })
                    }
                    placeholder="45-50 days"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">
                    3) Delivery time
                  </span>
                  <Input
                    value={form.deliveryTime}
                    onChange={(e) =>
                      patchForm({ deliveryTime: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">4) Packaging</span>
                <textarea
                  className={TEXTAREA_CLASS}
                  value={form.packagingNotes}
                  onChange={(e) =>
                    patchForm({ packagingNotes: e.target.value })
                  }
                  placeholder="Packaging and shipping instructions"
                />
              </label>
            </div>

            <div className="space-y-3 border-t border-stone-200 pt-4">
              <p className="text-sm font-medium text-stone-800">
                Beneficiary / bank details
              </p>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">Beneficiary name</span>
                <Input
                  value={form.beneficiaryName}
                  onChange={(e) =>
                    patchForm({ beneficiaryName: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">
                    Account number
                  </span>
                  <Input
                    value={form.beneficiaryAccountNumber}
                    onChange={(e) =>
                      patchForm({ beneficiaryAccountNumber: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">Swift code</span>
                  <Input
                    value={form.swiftCode}
                    onChange={(e) => patchForm({ swiftCode: e.target.value })}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">Country / region</span>
                <Input
                  value={form.beneficiaryCountry}
                  onChange={(e) =>
                    patchForm({ beneficiaryCountry: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">
                  Beneficiary address
                </span>
                <textarea
                  className={TEXTAREA_CLASS}
                  value={form.beneficiaryAddress}
                  onChange={(e) =>
                    patchForm({ beneficiaryAddress: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">Beneficiary bank</span>
                <Input
                  value={form.beneficiaryBank}
                  onChange={(e) =>
                    patchForm({ beneficiaryBank: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">
                  Beneficiary bank address
                </span>
                <textarea
                  className={TEXTAREA_CLASS}
                  value={form.beneficiaryBankAddress}
                  onChange={(e) =>
                    patchForm({ beneficiaryBankAddress: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">Bank code</span>
                  <Input
                    value={form.bankCode}
                    onChange={(e) => patchForm({ bankCode: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-stone-600">Branch code</span>
                  <Input
                    value={form.branchCode}
                    onChange={(e) => patchForm({ branchCode: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {notesPreview && (
              <div className="space-y-2 border-t border-stone-200 pt-4">
                <p className="text-sm font-medium text-stone-800">
                  PDF notes preview
                </p>
                <pre className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-600">
                  {notesPreview}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save supplier"}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}