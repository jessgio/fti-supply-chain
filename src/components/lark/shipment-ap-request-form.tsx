"use client";

import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AP_EXTRA_FILE_MAX_BYTES,
  AP_EXTRA_FILES_MAX_COUNT,
  AP_EXTRA_FILES_MAX_TOTAL_BYTES,
  AP_FORM_BRANDS,
  AP_FORM_CURRENCIES,
  AP_FORM_EXPENSE_CATEGORIES,
  DEFAULT_AP_BRAND,
  DEFAULT_AP_EXPENSE_CATEGORY,
  buildLarkApprovalDetailUrl,
  formatLarkApprovalStatus,
  isApFormCurrency,
  larkApprovalStatusBadgeClass,
  localTodayYmd,
  type ApBrandValue,
  type ApExpenseCategoryValue,
  type ApFormCurrency,
  type PaymentPlanRow,
} from "@/lib/lark/ap-form";
import {
  SHIPMENT_AP_INVOICE_LABELS,
  buildShipmentPaymentPlanRow,
  defaultShipmentApSupplierText,
  type ShipmentApInvoiceKind,
} from "@/lib/lark/shipment-ap";
import { formatPoMoney } from "@/lib/procurement/currencies";
import { readApiJson } from "@/lib/http";
import { uploadToSignedDataUploads } from "@/lib/storage/browser-upload";
import type { ShipmentLarkSubmission, Supplier } from "@/types/database";

type Colleague = {
  id: string;
  email: string;
  full_name: string | null;
  lark_open_id: string | null;
  is_default_approver?: boolean;
};

type LarkComment = {
  id: string;
  openId: string | null;
  comment: string;
  createTime: string | null;
  authorName: string | null;
  authorEmail: string | null;
};

const fieldClass =
  "mt-1 w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-900 placeholder:text-stone-400";

function labelFor(c: Colleague): string {
  return c.full_name?.trim() || c.email;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function networkErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message || fallback;
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) {
    return (
      "Network error while reaching the server. If you attached large files, " +
      `remove them (or keep extras under ${formatBytes(AP_EXTRA_FILES_MAX_TOTAL_BYTES)} total) and try again.`
    );
  }
  return msg;
}

function PaymentPlanDateInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (ymd: string) => void;
  disabled?: boolean;
}) {
  const initialValue = useRef(value);
  return (
    <input
      type="date"
      defaultValue={initialValue.current}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={fieldClass}
    />
  );
}

type Props = {
  shipmentId: string;
  invoiceKind: ShipmentApInvoiceKind;
  remarks: string;
  project: string;
  suppliers: Supplier[];
  poSuppliers: Supplier[];
  taxSupplierText: string;
  taxAmount: number;
  taxCurrency: ApFormCurrency;
  submissions: ShipmentLarkSubmission[];
  onSubmitted?: () => void;
};

export function ShipmentApRequestForm({
  shipmentId,
  invoiceKind,
  remarks: initialRemarks,
  project: initialProject,
  suppliers,
  poSuppliers,
  taxSupplierText,
  taxAmount,
  taxCurrency,
  submissions,
  onSubmitted,
}: Props) {
  const isShipping = invoiceKind === "shipping";
  const alreadySubmitted = submissions.length > 0;
  const [showSubmitForm, setShowSubmitForm] = useState(!alreadySubmitted);
  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenseCategory, setExpenseCategory] = useState<ApExpenseCategoryValue>(
    DEFAULT_AP_EXPENSE_CATEGORY,
  );
  const [brand, setBrand] = useState<ApBrandValue>(DEFAULT_AP_BRAND);
  const [apDate, setApDate] = useState(localTodayYmd());
  const [me, setMe] = useState<Colleague | null>(null);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [approverQuery, setApproverQuery] = useState("");
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [project, setProject] = useState(initialProject);
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    isShipping ? "" : (poSuppliers[0]?.id ?? ""),
  );
  const [supplier, setSupplier] = useState(() =>
    isShipping
      ? ""
      : taxSupplierText || defaultShipmentApSupplierText("tax", poSuppliers),
  );
  const [remarks, setRemarks] = useState(initialRemarks);
  const [planRows, setPlanRows] = useState<PaymentPlanRow[]>(() => [
    buildShipmentPaymentPlanRow({
      remarks: initialRemarks,
      amount: isShipping ? 0 : taxAmount,
      currency: isShipping ? "IDR" : taxCurrency,
    }),
  ]);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(
    submissions[0]?.id ?? null,
  );
  const [comments, setComments] = useState<LarkComment[]>([]);
  const [syncingStatus, setSyncingStatus] = useState(false);
  const fileInputId = `shipment-ap-files-${shipmentId}-${invoiceKind}`;

  const activeSubmission =
    submissions.find((s) => s.id === activeSubmissionId) ??
    submissions[0] ??
    null;
  const hasMyOpenId = !!me?.lark_open_id;
  const larkUrl = activeSubmission?.lark_instance_code
    ? buildLarkApprovalDetailUrl(activeSubmission.lark_instance_code)
    : null;
  const supplierOptions = useMemo(
    () =>
      [...suppliers].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [suppliers],
  );

  const selectableApprovers = useMemo(
    () => colleagues.filter((c) => !!c.lark_open_id),
    [colleagues],
  );
  const filteredApprovers = useMemo(() => {
    const q = approverQuery.trim().toLowerCase();
    if (!q) return selectableApprovers;
    return selectableApprovers.filter((c) => {
      const name = (c.full_name ?? "").toLowerCase();
      const email = c.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [approverQuery, selectableApprovers]);

  useEffect(() => {
    if (showSubmitForm) void loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSubmitForm]);

  useEffect(() => {
    if (!alreadySubmitted) return;
    void syncLarkDetails(activeSubmission?.id ?? submissions[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, invoiceKind, alreadySubmitted]);

  async function loadPeople() {
    setLoadingPeople(true);
    setError(null);
    try {
      const res = await fetch("/api/lark/colleagues");
      const data = (await res.json()) as {
        error?: string;
        me?: Colleague;
        colleagues?: Colleague[];
        defaultApproverOpenIds?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to load colleagues");
        return;
      }
      setMe(data.me ?? null);
      setColleagues(data.colleagues ?? []);
      const defaults = (data.defaultApproverOpenIds ?? []).filter((id) =>
        /^ou_[a-zA-Z0-9]+$/.test(id),
      );
      if (defaults.length > 0) {
        setSelectedApproverIds((prev) =>
          prev.length === 0 ? defaults : [...new Set([...defaults, ...prev])],
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load colleagues");
    } finally {
      setLoadingPeople(false);
    }
  }

  async function syncLarkDetails(submissionId?: string | null) {
    if (submissions.length === 0) return;
    setSyncingStatus(true);
    try {
      const qs = submissionId
        ? `?submissionId=${encodeURIComponent(submissionId)}`
        : "";
      const res = await fetch(`/api/shipments/${shipmentId}/ap-details${qs}`);
      const data = (await res.json()) as {
        error?: string;
        comments?: LarkComment[];
      };
      if (!res.ok && !data.comments) {
        setError(data.error ?? "Failed to refresh Lark status");
        return;
      }
      if (Array.isArray(data.comments)) setComments(data.comments);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh Lark status",
      );
    } finally {
      setSyncingStatus(false);
    }
  }

  function applySupplier(id: string) {
    setSelectedSupplierId(id);
    setSupplier(
      defaultShipmentApSupplierText(
        invoiceKind,
        isShipping ? suppliers : poSuppliers,
        id || null,
      ),
    );
  }

  function updatePlanRow(index: number, patch: Partial<PaymentPlanRow>) {
    setPlanRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addExtraFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    setExtraFiles((prev) => {
      const next = [...prev];
      let total = next.reduce((sum, f) => sum + f.size, 0);
      for (const file of incoming) {
        if (file.size > AP_EXTRA_FILE_MAX_BYTES) {
          setError(
            `"${file.name}" is too large (${formatBytes(file.size)}). Max ${formatBytes(AP_EXTRA_FILE_MAX_BYTES)} per file.`,
          );
          continue;
        }
        if (total + file.size > AP_EXTRA_FILES_MAX_TOTAL_BYTES) {
          setError(
            `Extra attachments would exceed ${formatBytes(AP_EXTRA_FILES_MAX_TOTAL_BYTES)} total. Remove some files first.`,
          );
          break;
        }
        const duplicate = next.some(
          (f) =>
            f.name === file.name &&
            f.size === file.size &&
            f.lastModified === file.lastModified,
        );
        if (!duplicate) {
          next.push(file);
          total += file.size;
        }
      }
      return next.slice(0, AP_EXTRA_FILES_MAX_COUNT);
    });
  }

  async function handleSubmit() {
    if (!showSubmitForm) return;
    if (!hasMyOpenId) {
      setError(
        "Your email is not in the Lark users directory yet. Ask an admin to add you under Lark users.",
      );
      return;
    }
    if (isShipping && !selectedSupplierId) {
      setError("Select a supplier for the shipping invoice");
      return;
    }
    if (selectedApproverIds.length === 0) {
      setError("Select at least one approver");
      return;
    }
    if (planRows.length === 0 || planRows.some((row) => row.amount <= 0)) {
      setError("Enter a payment amount greater than zero");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const storagePaths: Array<{
        path: string;
        filename: string;
        fileSize: number;
      }> = [];
      for (const file of extraFiles) {
        const prepared = await readApiJson<{ path: string; token: string }>(
          await fetch(`/api/shipments/${shipmentId}/ap-uploads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type || null,
              fileSize: file.size,
            }),
          }),
        );
        await uploadToSignedDataUploads(prepared.path, prepared.token, file);
        storagePaths.push({
          path: prepared.path,
          filename: file.name,
          fileSize: file.size,
        });
      }

      const form = new FormData();
      form.append("invoiceKind", invoiceKind);
      form.append("expenseCategory", expenseCategory);
      form.append("brand", brand);
      form.append("apDate", apDate);
      form.append("approverOpenIds", JSON.stringify(selectedApproverIds));
      form.append("project", project);
      form.append("supplier", supplier);
      form.append("remarks", remarks);
      form.append("planRows", JSON.stringify(planRows));
      form.append("storagePaths", JSON.stringify(storagePaths));
      if (selectedSupplierId) form.append("supplierId", selectedSupplierId);

      await readApiJson(
        await fetch(`/api/shipments/${shipmentId}/submit-ap`, {
          method: "POST",
          body: form,
        }),
      );
      setExtraFiles([]);
      setApproverQuery("");
      setShowSubmitForm(false);
      onSubmitted?.();
    } catch (err) {
      setError(networkErrorMessage(err, "Submit failed"));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = formatLarkApprovalStatus(
    activeSubmission?.lark_approval_status,
  );
  const statusClass = larkApprovalStatusBadgeClass(
    activeSubmission?.lark_approval_status,
  );

  return (
    <div className="space-y-4">
      {alreadySubmitted ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800/70">
                {SHIPMENT_AP_INVOICE_LABELS[invoiceKind]}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-stone-900">
                  Submitted to Lark
                </h3>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void syncLarkDetails(activeSubmission?.id).then(() =>
                    onSubmitted?.(),
                  );
                }}
                disabled={syncingStatus}
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
              >
                {syncingStatus ? "Refreshing…" : "Refresh status"}
              </button>
              {!showSubmitForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowSubmitForm(true);
                    setError(null);
                  }}
                  className="rounded-md border border-stone-900 bg-white px-3 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
                >
                  Submit another
                </button>
              ) : null}
              {larkUrl ? (
                <a
                  href={larkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800"
                >
                  Open in Lark
                </a>
              ) : null}
            </div>
          </div>

          {submissions.length > 1 ? (
            <ul className="mt-4 space-y-1">
              {submissions.map((sub) => {
                const selected = sub.id === (activeSubmission?.id ?? "");
                return (
                  <li key={sub.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubmissionId(sub.id);
                        void syncLarkDetails(sub.id);
                      }}
                      className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                        selected
                          ? "border-emerald-300 bg-white"
                          : "border-stone-200 bg-white/70 hover:bg-white"
                      }`}
                    >
                      <span className="font-medium text-stone-900">
                        {sub.submitted_amount != null
                          ? formatPoMoney(
                              sub.submitted_amount,
                              sub.submitted_currency ?? "IDR",
                            )
                          : SHIPMENT_AP_INVOICE_LABELS[invoiceKind]}
                        {sub.supplier_name ? ` · ${sub.supplier_name}` : ""}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${larkApprovalStatusBadgeClass(sub.lark_approval_status)}`}
                      >
                        {formatLarkApprovalStatus(sub.lark_approval_status)}
                      </span>
                      <span className="w-full font-mono text-[11px] text-stone-500 sm:w-auto">
                        {sub.lark_serial_number || sub.lark_instance_code}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2.5">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                  Amount
                </dt>
                <dd className="mt-1 text-sm font-semibold text-stone-900">
                  {activeSubmission?.submitted_amount != null
                    ? formatPoMoney(
                        activeSubmission.submitted_amount,
                        activeSubmission.submitted_currency ?? "IDR",
                      )
                    : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2.5">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                  Reference
                </dt>
                <dd className="mt-1 font-mono text-sm font-semibold text-stone-900">
                  {activeSubmission?.lark_serial_number || "Fetching…"}
                </dd>
              </div>
              <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2.5">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                  Submitted
                </dt>
                <dd className="mt-1 text-sm text-stone-900">
                  {activeSubmission?.submitted_at
                    ? format(
                        new Date(activeSubmission.submitted_at),
                        "dd/MM/yyyy HH:mm",
                      )
                    : "—"}
                </dd>
              </div>
            </dl>
          )}

          <div className="mt-4 border-t border-emerald-200/80 pt-4">
            <h4 className="text-sm font-semibold text-stone-900">Comments</h4>
            {comments.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-stone-300 bg-white px-3 py-3 text-sm text-stone-500">
                {syncingStatus ? "Refreshing…" : "No comments yet."}
              </p>
            ) : (
              <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-stone-900">
                        {comment.authorName?.trim() ||
                          comment.authorEmail?.trim() ||
                          "Unknown"}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        {comment.createTime
                          ? format(new Date(comment.createTime), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800/90">
                      {comment.comment || "(empty comment)"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && !showSubmitForm ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {!alreadySubmitted && !showSubmitForm ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            {SHIPMENT_AP_INVOICE_LABELS[invoiceKind]}
          </p>
          <h3 className="mt-1 text-base font-semibold text-stone-900">
            Payment request
          </h3>
          <p className="mt-1 text-sm text-stone-500">
            Submit a Lark AP Form for this {SHIPMENT_AP_INVOICE_LABELS[invoiceKind].toLowerCase()}.
          </p>
          <button
            type="button"
            onClick={() => {
              setShowSubmitForm(true);
              setError(null);
            }}
            className="mt-4 rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Submit new AP Form
          </button>
        </section>
      ) : null}

      {showSubmitForm ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="border-b border-stone-100 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Lark AP Form
            </p>
            <h3 className="mt-1 text-base font-semibold text-stone-900">
              {alreadySubmitted
                ? `Submit another ${SHIPMENT_AP_INVOICE_LABELS[invoiceKind].toLowerCase()}`
                : `Submit ${SHIPMENT_AP_INVOICE_LABELS[invoiceKind].toLowerCase()}`}
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {isShipping
                ? "Choose the freight supplier and fill in the shipping invoice amount. Payment details go into the Supplier field."
                : "Prefills the tax invoice from shipped quantity × PO unit cost. Edit the amount before submit if needed."}
            </p>
            {alreadySubmitted ? (
              <button
                type="button"
                onClick={() => setShowSubmitForm(false)}
                className="mt-2 text-xs font-medium text-stone-600 underline hover:text-stone-900"
              >
                Cancel
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              {isShipping ? (
                supplierOptions.length > 0 ? (
                  <label className="block text-xs font-medium text-stone-600">
                    Supplier <span className="text-red-600">*</span>
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => applySupplier(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select supplier…</option>
                      {supplierOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-amber-800">
                    No suppliers found. Add one under Procurement first.
                  </p>
                )
              ) : null}

              <label className="block text-xs font-medium text-stone-600">
                Payment details
                <textarea
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  rows={8}
                  placeholder="Supplier name and payment / banking details"
                  className={`${fieldClass} resize-y font-mono text-xs`}
                />
                <span className="mt-0.5 block text-[11px] font-normal text-stone-500">
                  {isShipping
                    ? "Filled from the selected supplier. Edit before submit if needed."
                    : "Prefills from the PO supplier banking details."}
                </span>
              </label>

              <label className="block text-xs font-medium text-stone-600">
                AP date (应付日期)
                <input
                  type="date"
                  value={apDate}
                  onChange={(e) => setApDate(e.target.value)}
                  className={fieldClass}
                />
              </label>

              <label className="block text-xs font-medium text-stone-600">
                Brand
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as ApBrandValue)}
                  className={fieldClass}
                >
                  {AP_FORM_BRANDS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.text}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-stone-600">
                Expense category (支出类别)
                <select
                  value={expenseCategory}
                  onChange={(e) =>
                    setExpenseCategory(e.target.value as ApExpenseCategoryValue)
                  }
                  className={fieldClass}
                >
                  {AP_FORM_EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.textEn} ({c.textZh})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-stone-600">
                Project{" "}
                <span className="font-normal text-stone-400">(optional)</span>
                <input
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className={fieldClass}
                />
              </label>

              <div>
                <p className="text-xs font-medium text-stone-600">
                  Payment plan (付款计划)
                </p>
                {!isShipping ? (
                  <p className="mt-1 text-[11px] text-stone-500">
                    Estimated from shipped qty × PO unit cost
                    {taxAmount > 0
                      ? `: ${formatPoMoney(taxAmount, taxCurrency)}`
                      : ""}
                    .
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-stone-500">
                    Enter the shipping invoice amount.
                  </p>
                )}
                <div className="mt-1.5 space-y-2">
                  {planRows.map((row, index) => (
                    <div
                      key={`plan-${index}`}
                      className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[11px] text-stone-500">
                          Date
                          <PaymentPlanDateInput
                            key={`plan-date-${index}`}
                            value={row.dateYmd}
                            onChange={(dateYmd) =>
                              updatePlanRow(index, { dateYmd })
                            }
                          />
                        </label>
                        <label className="block text-[11px] text-stone-500">
                          Amount
                          <input
                            type="number"
                            step="any"
                            min={0}
                            value={row.amount}
                            onChange={(e) =>
                              updatePlanRow(index, {
                                amount: Number(e.target.value) || 0,
                              })
                            }
                            className={fieldClass}
                          />
                        </label>
                      </div>
                      <label className="block text-[11px] text-stone-500">
                        Currency
                        <select
                          value={row.currency}
                          onChange={(e) => {
                            const currency = e.target.value;
                            if (!isApFormCurrency(currency)) return;
                            updatePlanRow(index, { currency });
                          }}
                          className={fieldClass}
                        >
                          {AP_FORM_CURRENCIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-[11px] text-stone-500">
                        Remarks · {formatPoMoney(row.amount, row.currency)}
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(e) =>
                            updatePlanRow(index, { remarks: e.target.value })
                          }
                          className={fieldClass}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block text-xs font-medium text-stone-600">
                Remarks
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={4}
                  className={`${fieldClass} resize-y`}
                />
              </label>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <p className="text-xs font-medium text-stone-600">
                  Owner / submitter (归属人)
                </p>
                {loadingPeople ? (
                  <p className="mt-1 text-xs text-stone-500">Checking…</p>
                ) : hasMyOpenId ? (
                  <p className="mt-1 text-sm text-stone-900">
                    {me?.full_name || me?.email || "You"}
                    <span className="mt-0.5 block text-[11px] text-stone-500">
                      Linked via Lark users directory
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-800">
                    Your account isn&apos;t in{" "}
                    <a href="/dashboard/lark-users" className="underline">
                      Lark users
                    </a>{" "}
                    yet.
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-stone-600">
                  Approvers <span className="text-red-600">*</span>
                </p>
                {loadingPeople ? (
                  <p className="mt-1 text-xs text-stone-500">Loading…</p>
                ) : selectableApprovers.length === 0 ? (
                  <p className="mt-1 text-xs text-stone-500">
                    No linked colleagues yet. Add people under{" "}
                    <a href="/dashboard/lark-users" className="underline">
                      Lark users
                    </a>
                    .
                  </p>
                ) : (
                  <>
                    <input
                      type="search"
                      value={approverQuery}
                      onChange={(e) => setApproverQuery(e.target.value)}
                      placeholder="Search by name or email…"
                      className={fieldClass}
                    />
                    <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-md border border-stone-300 p-1.5">
                      {filteredApprovers.length === 0 ? (
                        <li className="px-1.5 py-1 text-xs text-stone-500">
                          No matches
                        </li>
                      ) : (
                        filteredApprovers.map((c) => {
                          const openId = c.lark_open_id!;
                          const checked = selectedApproverIds.includes(openId);
                          return (
                            <li key={c.id}>
                              <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm text-stone-900 hover:bg-stone-50">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedApproverIds((prev) =>
                                      prev.includes(openId)
                                        ? prev.filter((id) => id !== openId)
                                        : [...prev, openId],
                                    )
                                  }
                                  className="accent-stone-900"
                                />
                                <span className="min-w-0 truncate">
                                  {labelFor(c)}
                                  {c.is_default_approver ? (
                                    <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                                      default
                                    </span>
                                  ) : null}
                                  <span className="block truncate text-[11px] text-stone-500">
                                    {c.email}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-stone-600">
                  Attachments (附件)
                </p>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Add the tax or shipping invoice (max {AP_EXTRA_FILES_MAX_COUNT}{" "}
                  files, {formatBytes(AP_EXTRA_FILE_MAX_BYTES)} each).
                </p>
                <label
                  htmlFor={fileInputId}
                  className="mt-2 flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5 hover:border-stone-500 hover:bg-stone-100"
                >
                  <span className="text-xs font-medium text-stone-900">
                    Choose files…
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {extraFiles.length === 0
                      ? "No files selected yet"
                      : `${extraFiles.length} file${extraFiles.length === 1 ? "" : "s"} selected`}
                  </span>
                  <input
                    id={fileInputId}
                    type="file"
                    multiple
                    disabled={busy || extraFiles.length >= AP_EXTRA_FILES_MAX_COUNT}
                    className="mt-1 block w-full cursor-pointer text-xs text-stone-600 file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-stone-900 file:px-2 file:py-1 file:text-xs file:font-medium file:text-white"
                    onChange={(e) => {
                      addExtraFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {extraFiles.length > 0 ? (
                  <ul className="mt-1.5 space-y-1 rounded-md border border-stone-300 bg-white p-1.5">
                    {extraFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                        className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs text-stone-900"
                      >
                        <span className="min-w-0 truncate" title={file.name}>
                          {file.name}
                          <span className="text-stone-500">
                            {" "}
                            · {formatBytes(file.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setExtraFiles((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                          className="shrink-0 text-stone-500 underline hover:text-red-700"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={
                busy ||
                !hasMyOpenId ||
                selectedApproverIds.length === 0 ||
                loadingPeople ||
                (isShipping && !selectedSupplierId)
              }
              className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Submitting to Lark…" : "Submit to Lark AP"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
