"use client";

import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import {
  AP_FORM_BRANDS,
  AP_FORM_EXPENSE_CATEGORIES,
  AP_PAYMENT_PLAN_SCOPES,
  DEFAULT_AP_BRAND,
  DEFAULT_AP_EXPENSE_CATEGORY,
  buildLarkApprovalDetailUrl,
  buildPaymentPlanRows,
  defaultApProject,
  defaultApRemarks,
  defaultApSupplier,
  formatLarkApprovalStatus,
  isApFormCurrency,
  larkApprovalStatusBadgeClass,
  localTodayYmd,
  paymentAmountForApScope,
  paymentAmountForApSubmission,
  poHasSplitPaymentPlan,
  type ApBrandValue,
  type ApExpenseCategoryValue,
  type ApPaymentPlanScope,
  type PaymentPlanRow,
} from "@/lib/lark/ap-form";
import { formatPoMoney } from "@/lib/procurement/currencies";
import type {
  PurchaseOrder,
  PurchaseOrderLarkSubmission,
  Supplier,
} from "@/types/database";

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

function paymentScopeLabel(scope: string | null | undefined): string {
  switch (scope) {
    case "down_payment":
      return "Down payment only";
    case "balance":
      return "Balance only";
    case "both":
      return "Down payment + balance";
    default:
      return "Payment";
  }
}

type Props = {
  po: PurchaseOrder;
  /** Full supplier row — used to prefill payment details in the AP supplier field. */
  supplier?: Supplier | null;
  onUpdated?: (po: PurchaseOrder) => void;
};

function labelFor(c: Colleague): string {
  return c.full_name?.trim() || c.email;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Vercel serverless request body limit is ~4.5MB; leave headroom for form fields. */
const MAX_EXTRA_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_EXTRA_BYTES = 4 * 1024 * 1024;

function networkErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message || fallback;
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) {
    return (
      "Network error while reaching the server. If you attached large files, " +
      "remove them (or keep extras under 4 MB total) and try again. " +
      "The PO PDF is attached automatically on the server."
    );
  }
  return msg;
}

const fieldClass =
  "mt-1 w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-900 placeholder:text-stone-400";

export function LarkApSubmissionPanel({ po, supplier: supplierRecord, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenseCategory, setExpenseCategory] =
    useState<ApExpenseCategoryValue>(
      (po.lark_expense_category as ApExpenseCategoryValue) ||
        DEFAULT_AP_EXPENSE_CATEGORY,
    );
  const [brand, setBrand] = useState<ApBrandValue>(DEFAULT_AP_BRAND);
  const [apDate, setApDate] = useState(localTodayYmd());
  const [me, setMe] = useState<Colleague | null>(null);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [approverQuery, setApproverQuery] = useState("");
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [project, setProject] = useState(() => defaultApProject(po));
  const [supplier, setSupplier] = useState(() =>
    defaultApSupplier(po, supplierRecord),
  );
  const [remarks, setRemarks] = useState(() => defaultApRemarks(po));
  const [paymentPlanScope, setPaymentPlanScope] =
    useState<ApPaymentPlanScope>("both");
  const [planRows, setPlanRows] = useState<PaymentPlanRow[]>(() => {
    try {
      return buildPaymentPlanRows(po, "both");
    } catch {
      return [];
    }
  });
  const hasSplitPlan = poHasSplitPaymentPlan(po);
  const [serialNumber, setSerialNumber] = useState(po.lark_serial_number);
  const [approvalStatus, setApprovalStatus] = useState(
    po.lark_approval_status,
  );
  const [statusSyncedAt, setStatusSyncedAt] = useState(
    po.lark_status_synced_at,
  );
  const [comments, setComments] = useState<LarkComment[]>([]);
  const [submissions, setSubmissions] = useState<PurchaseOrderLarkSubmission[]>(
    [],
  );
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(
    null,
  );
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkReference, setLinkReference] = useState("");
  const [linkPaymentScope, setLinkPaymentScope] =
    useState<ApPaymentPlanScope>("both");
  const [linking, setLinking] = useState(false);
  const [updatingSubmission, setUpdatingSubmission] = useState(false);
  const [removingLink, setRemovingLink] = useState(false);
  const [syncingStatus, setSyncingStatus] = useState(false);
  const fileInputId = `lark-ap-files-${po.id}`;

  const alreadySubmitted = !!po.lark_instance_code || submissions.length > 0;
  const currencyOk = isApFormCurrency(po.currency ?? "IDR");
  const hasMyOpenId = !!me?.lark_open_id;
  const activeSubmission =
    submissions.find((s) => s.id === activeSubmissionId) ??
    submissions[0] ??
    null;
  const larkUrl = activeSubmission?.lark_instance_code
    ? buildLarkApprovalDetailUrl(activeSubmission.lark_instance_code)
    : po.lark_instance_code
      ? buildLarkApprovalDetailUrl(po.lark_instance_code)
      : null;

  // When supplier banking details load after mount, upgrade a name-only prefill.
  useEffect(() => {
    if (!showSubmitForm || !supplierRecord) return;
    const next = defaultApSupplier(po, supplierRecord);
    if (!next) return;
    setSupplier((current) => {
      const nameOnly = (po.supplier_name ?? "").trim();
      if (!current.trim() || current.trim() === nameOnly) return next;
      return current;
    });
  }, [showSubmitForm, po, supplierRecord]);

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

  useEffect(() => {
    if (showSubmitForm) void loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSubmitForm]);

  async function syncLarkDetails(submissionId?: string | null) {
    if (!po.lark_instance_code && submissions.length === 0) return;
    setSyncingStatus(true);
    try {
      const qs = submissionId
        ? `?submissionId=${encodeURIComponent(submissionId)}`
        : "";
      const res = await fetch(
        `/api/procurement/pos/${po.id}/lark-details${qs}`,
      );
      const data = (await res.json()) as {
        error?: string;
        serialNumber?: string | null;
        status?: string | null;
        syncedAt?: string | null;
        comments?: LarkComment[];
        submissions?: PurchaseOrderLarkSubmission[];
      };
      if (!res.ok && !data.status && !data.serialNumber && !data.submissions?.length) {
        setError(data.error ?? "Failed to refresh Lark status");
        return;
      }
      if (Array.isArray(data.submissions)) {
        setSubmissions(data.submissions);
        if (!activeSubmissionId && data.submissions[0]) {
          setActiveSubmissionId(data.submissions[0].id);
        }
      }
      if (data.serialNumber) setSerialNumber(data.serialNumber);
      if (data.status) {
        setApprovalStatus(
          data.status as PurchaseOrder["lark_approval_status"],
        );
      }
      if (data.syncedAt) setStatusSyncedAt(data.syncedAt);
      if (Array.isArray(data.comments)) setComments(data.comments);
      setError(null);
      if (onUpdated && (data.status || data.serialNumber)) {
        onUpdated({
          ...po,
          lark_serial_number: data.serialNumber ?? po.lark_serial_number,
          lark_approval_status:
            (data.status as PurchaseOrder["lark_approval_status"]) ??
            po.lark_approval_status,
          lark_status_synced_at: data.syncedAt ?? po.lark_status_synced_at,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh Lark status",
      );
    } finally {
      setSyncingStatus(false);
    }
  }

  useEffect(() => {
    if (!po.lark_instance_code && submissions.length === 0) return;
    void syncLarkDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.id, po.lark_instance_code]);

  function nextPaymentScopeHint(): ApPaymentPlanScope {
    const submittedScopes = new Set(submissions.map((s) => s.payment_scope));
    if (!hasSplitPlan) return "both";
    if (
      submittedScopes.has("down_payment") &&
      !submittedScopes.has("balance")
    ) {
      return "balance";
    }
    if (
      submittedScopes.has("balance") &&
      !submittedScopes.has("down_payment")
    ) {
      return "down_payment";
    }
    return alreadySubmitted ? "down_payment" : "both";
  }

  function openAnotherSubmitForm() {
    const nextScope = nextPaymentScopeHint();
    applyPaymentPlanScope(nextScope);
    setShowLinkForm(false);
    setShowSubmitForm(true);
  }

  function openLinkForm() {
    setLinkPaymentScope(nextPaymentScopeHint());
    setShowSubmitForm(false);
    setShowLinkForm(true);
    setError(null);
  }

  async function handleLink() {
    const reference = linkReference.trim();
    if (!reference) {
      setError("Enter the AP Form reference number from Lark");
      return;
    }

    setLinking(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/pos/${po.id}/link-lark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceNumber: reference,
          paymentScope: linkPaymentScope,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        instanceCode?: string;
        serialNumber?: string | null;
        status?: string | null;
        syncedAt?: string | null;
        purchaseOrder?: PurchaseOrder;
        submission?: PurchaseOrderLarkSubmission;
        comments?: LarkComment[];
      };
      if (!res.ok) {
        setError(data.error ?? `Link failed (${res.status})`);
        return;
      }
      if (data.serialNumber) setSerialNumber(data.serialNumber);
      if (data.status) {
        setApprovalStatus(
          data.status as PurchaseOrder["lark_approval_status"],
        );
      }
      if (data.syncedAt) setStatusSyncedAt(data.syncedAt);
      if (Array.isArray(data.comments)) setComments(data.comments);
      if (data.submission) {
        setSubmissions((prev) => {
          const without = prev.filter((s) => s.id !== data.submission!.id);
          return [data.submission!, ...without];
        });
        setActiveSubmissionId(data.submission.id);
      }
      setLinkReference("");
      setShowLinkForm(false);
      setShowSubmitForm(false);
      if (data.purchaseOrder && onUpdated) {
        onUpdated(data.purchaseOrder);
      } else if (onUpdated) {
        onUpdated({
          ...po,
          lark_instance_code: data.instanceCode ?? po.lark_instance_code,
          lark_serial_number: data.serialNumber ?? po.lark_serial_number,
          lark_approval_status:
            (data.status as PurchaseOrder["lark_approval_status"]) ??
            po.lark_approval_status,
          lark_submitted_at: data.syncedAt ?? po.lark_submitted_at,
          lark_status_synced_at: data.syncedAt ?? po.lark_status_synced_at,
        });
      }
      void syncLarkDetails(data.submission?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setLinking(false);
    }
  }

  async function updateSubmissionMeta(input: {
    paymentScope?: ApPaymentPlanScope;
  }) {
    const submissionId = activeSubmission?.id;
    if (!submissionId || submissionId === "legacy") return;

    setUpdatingSubmission(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/lark-submissions/${submissionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentScope: input.paymentScope,
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        submission?: PurchaseOrderLarkSubmission;
      };
      if (!res.ok) {
        setError(data.error ?? `Update failed (${res.status})`);
        return;
      }
      if (data.submission) {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === data.submission!.id ? data.submission! : s)),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingSubmission(false);
    }
  }

  async function removeSubmissionLink() {
    const submissionId =
      activeSubmission?.id && activeSubmission.id !== "legacy"
        ? activeSubmission.id
        : po.lark_instance_code
          ? "legacy"
          : null;
    if (!submissionId) return;

    const ref =
      activeSubmission?.lark_serial_number ||
      serialNumber ||
      activeSubmission?.lark_instance_code ||
      po.lark_instance_code ||
      "this AP Form";
    const confirmed = window.confirm(
      `Remove the link to ${ref} from this PO?\n\nThe AP Form in Lark is not canceled — only the link in this app is removed.`,
    );
    if (!confirmed) return;

    setRemovingLink(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/lark-submissions/${submissionId}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        error?: string;
        submissions?: PurchaseOrderLarkSubmission[];
        purchaseOrder?: PurchaseOrder;
      };
      if (!res.ok) {
        setError(data.error ?? `Remove failed (${res.status})`);
        return;
      }

      const remaining = Array.isArray(data.submissions) ? data.submissions : [];
      setSubmissions(remaining);
      setActiveSubmissionId(remaining[0]?.id ?? null);
      setComments([]);

      if (remaining[0]) {
        setSerialNumber(remaining[0].lark_serial_number);
        setApprovalStatus(remaining[0].lark_approval_status);
        setStatusSyncedAt(remaining[0].lark_status_synced_at);
        void syncLarkDetails(remaining[0].id);
      } else {
        setSerialNumber(null);
        setApprovalStatus(null);
        setStatusSyncedAt(null);
        setShowSubmitForm(false);
        setShowLinkForm(false);
      }

      if (data.purchaseOrder && onUpdated) {
        onUpdated(data.purchaseOrder);
      } else if (onUpdated) {
        onUpdated({
          ...po,
          lark_instance_code: remaining[0]?.lark_instance_code ?? null,
          lark_serial_number: remaining[0]?.lark_serial_number ?? null,
          lark_approval_status: remaining[0]?.lark_approval_status ?? null,
          lark_status_synced_at: remaining[0]?.lark_status_synced_at ?? null,
          lark_submitted_at: remaining[0]?.submitted_at ?? null,
          lark_expense_category: remaining[0]?.lark_expense_category ?? null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemovingLink(false);
    }
  }

  function toggleApprover(openId: string) {
    setSelectedApproverIds((prev) =>
      prev.includes(openId)
        ? prev.filter((id) => id !== openId)
        : [...prev, openId],
    );
  }

  function addExtraFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    setExtraFiles((prev) => {
      const next = [...prev];
      let total = next.reduce((sum, f) => sum + f.size, 0);
      for (const file of incoming) {
        if (file.size > MAX_EXTRA_FILE_BYTES) {
          setError(
            `"${file.name}" is too large (${formatBytes(file.size)}). Max ${formatBytes(MAX_EXTRA_FILE_BYTES)} per file.`,
          );
          continue;
        }
        if (total + file.size > MAX_TOTAL_EXTRA_BYTES) {
          setError(
            `Extra attachments would exceed ${formatBytes(MAX_TOTAL_EXTRA_BYTES)} total. Remove some files first.`,
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
      return next.slice(0, 10);
    });
  }

  function removeExtraFile(index: number) {
    setExtraFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function applyPaymentPlanScope(scope: ApPaymentPlanScope) {
    setPaymentPlanScope(scope);
    try {
      setPlanRows(buildPaymentPlanRows(po, scope));
    } catch {
      setPlanRows([]);
    }
  }

  function updatePlanRow(index: number, patch: Partial<PaymentPlanRow>) {
    setPlanRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

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

  async function handleSubmit() {
    if (!showSubmitForm || !currencyOk) return;
    if (!hasMyOpenId) {
      setError(
        "Your email is not in the Lark users directory yet. Ask an admin to add you under Lark users.",
      );
      return;
    }
    if (selectedApproverIds.length === 0) {
      setError("Select at least one approver");
      return;
    }
    if (planRows.length === 0) {
      setError("Add at least one payment plan row");
      return;
    }

    const extraTotal = extraFiles.reduce((sum, f) => sum + f.size, 0);
    if (extraTotal > MAX_TOTAL_EXTRA_BYTES) {
      setError(
        `Extra attachments are too large (${formatBytes(extraTotal)}). Keep under ${formatBytes(MAX_TOTAL_EXTRA_BYTES)}.`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // PO PDF is generated and attached on the server — do not upload it here
      // (re-uploading the PDF was hitting Vercel's body size limit → "Failed to fetch").
      const form = new FormData();
      form.append("expenseCategory", expenseCategory);
      form.append("brand", brand);
      form.append("apDate", apDate);
      form.append("approverOpenIds", JSON.stringify(selectedApproverIds));
      form.append("project", project);
      form.append("supplier", supplier);
      form.append("remarks", remarks);
      form.append("paymentScope", paymentPlanScope);
      form.append("planRows", JSON.stringify(planRows));
      for (const file of extraFiles) {
        form.append("files", file, file.name);
      }

      const res = await fetch(`/api/procurement/pos/${po.id}/submit-lark`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        instanceCode?: string;
        serialNumber?: string | null;
        status?: string | null;
        purchaseOrder?: PurchaseOrder;
      };
      if (!res.ok) {
        setError(data.error ?? `Submit failed (${res.status})`);
        return;
      }
      if (data.serialNumber) setSerialNumber(data.serialNumber);
      if (data.status) {
        setApprovalStatus(
          data.status as PurchaseOrder["lark_approval_status"],
        );
      }
      setStatusSyncedAt(new Date().toISOString());
      setExtraFiles([]);
      setApproverQuery("");
      setShowSubmitForm(false);
      if (data.purchaseOrder && onUpdated) {
        onUpdated(data.purchaseOrder);
      } else if (onUpdated) {
        onUpdated({
          ...po,
          lark_instance_code: data.instanceCode ?? po.lark_instance_code,
          lark_serial_number: data.serialNumber ?? po.lark_serial_number,
          lark_approval_status:
            (data.status as PurchaseOrder["lark_approval_status"]) ??
            po.lark_approval_status,
          lark_submitted_at: new Date().toISOString(),
          lark_expense_category: expenseCategory,
        });
      }
      // Refresh submission history after a successful submit.
      void syncLarkDetails();
    } catch (err) {
      setError(networkErrorMessage(err, "Submit failed"));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = formatLarkApprovalStatus(
    activeSubmission?.lark_approval_status ?? approvalStatus,
  );
  const statusClass = larkApprovalStatusBadgeClass(
    activeSubmission?.lark_approval_status ?? approvalStatus,
  );
  const activePaymentAmount = useMemo(() => {
    if (activeSubmission) {
      return paymentAmountForApSubmission(po, activeSubmission);
    }
    return paymentAmountForApScope(po, "both");
  }, [po, activeSubmission]);

  return (
    <div className="space-y-4">
      {alreadySubmitted ? (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800/70">
              Lark AP Form
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-stone-900">
                Submitted to Lark
              </h2>
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
              onClick={() => void syncLarkDetails(activeSubmission?.id)}
              disabled={syncingStatus}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
            >
              {syncingStatus ? "Refreshing…" : "Refresh status"}
            </button>
            {!showSubmitForm && !showLinkForm ? (
              <>
                <button
                  type="button"
                  onClick={openAnotherSubmitForm}
                  className="rounded-md border border-stone-900 bg-white px-3 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
                >
                  Submit another
                </button>
                <button
                  type="button"
                  onClick={openLinkForm}
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
                >
                  Link existing AP Form
                </button>
              </>
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
          <div className="mt-4">
            <p className="text-xs font-medium text-stone-600">Submissions</p>
            <ul className="mt-1.5 space-y-1">
              {submissions.map((sub) => {
                const selected = sub.id === (activeSubmission?.id ?? "");
                const amount = paymentAmountForApSubmission(po, sub);
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
                        {paymentScopeLabel(sub.payment_scope)}
                        {amount
                          ? ` · ${formatPoMoney(amount.amount, amount.currency)}`
                          : ""}
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
          </div>
        ) : null}

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
              AP status
            </dt>
            <dd className="mt-1 text-sm font-semibold text-stone-900">
              {activeSubmission?.lark_approval_status || approvalStatus
                ? statusLabel
                : "Syncing…"}
            </dd>
          </div>
          <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
              Payment amount
            </dt>
            <dd className="mt-1 text-sm font-semibold text-stone-900">
              {activePaymentAmount
                ? formatPoMoney(
                    activePaymentAmount.amount,
                    activePaymentAmount.currency,
                  )
                : "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
              Reference number
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-stone-900">
              {activeSubmission?.lark_serial_number ||
                serialNumber ||
                "Fetching…"}
            </dd>
          </div>
          <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
              Submitted
            </dt>
            <dd className="mt-1 text-sm text-stone-900">
              {activeSubmission?.submitted_at || po.lark_submitted_at
                ? format(
                    new Date(
                      activeSubmission?.submitted_at ||
                        po.lark_submitted_at ||
                        "",
                    ),
                    "dd/MM/yyyy HH:mm",
                  )
                : "—"}
            </dd>
          </div>
        </dl>

        {activeSubmission || po.lark_instance_code ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {activeSubmission && activeSubmission.id !== "legacy" ? (
              <label className="block min-w-[12rem] text-xs font-medium text-stone-600">
                Payment scope
                <select
                  value={activeSubmission.payment_scope}
                  disabled={updatingSubmission || removingLink}
                  onChange={(e) =>
                    void updateSubmissionMeta({
                      paymentScope: e.target.value as ApPaymentPlanScope,
                    })
                  }
                  className={`${fieldClass} max-w-xs`}
                >
                  {AP_PAYMENT_PLAN_SCOPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : activeSubmission ? (
              <p className="text-xs text-stone-500">
                Scope: {paymentScopeLabel(activeSubmission.payment_scope)}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void removeSubmissionLink()}
              disabled={updatingSubmission || removingLink}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {removingLink ? "Removing…" : "Remove link"}
            </button>
            {updatingSubmission ? (
              <span className="pb-2 text-xs text-stone-500">Saving…</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 border-t border-emerald-200/80 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-stone-900">Comments</h3>
            <span className="text-xs text-stone-500">
              {syncingStatus
                ? "Refreshing…"
                : `${comments.length} from Lark`}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">
            Pulled from the Lark AP Form comment thread. Refresh to update.
          </p>
          {comments.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-stone-300 bg-white px-3 py-4 text-sm text-stone-500">
              No comments yet.
            </p>
          ) : (
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {comments.map((comment) => {
                const author =
                  comment.authorName?.trim() ||
                  comment.authorEmail?.trim() ||
                  comment.openId ||
                  "Unknown";
                return (
                  <li
                    key={comment.id}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-stone-900">
                        {author}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        {comment.createTime
                          ? format(
                              new Date(comment.createTime),
                              "dd/MM/yyyy HH:mm",
                            )
                          : "—"}
                      </p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800/90">
                      {comment.comment || "(empty comment)"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-3 text-xs text-stone-500">
          Status mirrors the Lark AP Form
          {statusSyncedAt
            ? ` · last checked ${format(new Date(statusSyncedAt), "dd/MM/yyyy HH:mm")}`
            : ""}
          . PO fulfillment status is unchanged.
        </p>

        {error && !showSubmitForm && !showLinkForm ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      ) : null}

      {showLinkForm ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
          <div className="border-b border-stone-100 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Lark AP Form
            </p>
            <h2 className="mt-1 text-base font-semibold text-stone-900">
              {alreadySubmitted
                ? "Link another existing AP Form"
                : "Link existing AP Form"}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Attach an AP Form already submitted in Lark. Paste the reference
              number (审批单编号) — status and comments will sync to this PO.
            </p>
            {alreadySubmitted ? (
              <button
                type="button"
                onClick={() => {
                  setShowLinkForm(false);
                  setError(null);
                }}
                className="mt-2 text-xs font-medium text-stone-600 underline hover:text-stone-900"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowLinkForm(false);
                  setShowSubmitForm(true);
                  setError(null);
                }}
                className="mt-2 text-xs font-medium text-stone-600 underline hover:text-stone-900"
              >
                Submit a new AP Form instead
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-stone-600 sm:col-span-2">
              Reference number <span className="text-red-600">*</span>
              <input
                type="text"
                value={linkReference}
                onChange={(e) => setLinkReference(e.target.value)}
                placeholder="e.g. 202407110001"
                autoComplete="off"
                className={`${fieldClass} font-mono`}
              />
              <span className="mt-0.5 block text-[11px] font-normal text-stone-500">
                Visible on the Lark approval. A Lark approval URL also works if
                you have one.
              </span>
            </label>

            {hasSplitPlan || alreadySubmitted ? (
              <label className="block text-xs font-medium text-stone-600">
                Payment scope
                <select
                  value={linkPaymentScope}
                  onChange={(e) =>
                    setLinkPaymentScope(e.target.value as ApPaymentPlanScope)
                  }
                  className={fieldClass}
                >
                  {AP_PAYMENT_PLAN_SCOPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {error ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              onClick={() => void handleLink()}
              disabled={linking || !linkReference.trim()}
              className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {linking ? "Looking up in Lark…" : "Link to this PO"}
            </button>
          </div>
        </section>
      ) : null}

      {!alreadySubmitted && !showSubmitForm && !showLinkForm ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Lark AP Form
          </p>
          <h2 className="mt-1 text-base font-semibold text-stone-900">
            Payment request
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Submit a new AP Form to Lark, or link one that was already filed
            outside this app.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setShowLinkForm(false);
                setShowSubmitForm(true);
                setError(null);
              }}
              className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
            >
              Submit new AP Form
            </button>
            <button
              type="button"
              onClick={openLinkForm}
              className="rounded-md border border-stone-900 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Link existing AP Form
            </button>
          </div>
        </section>
      ) : null}

      {showSubmitForm ? (
    <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="border-b border-stone-100 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          Lark AP Form
        </p>
        <h2 className="mt-1 text-base font-semibold text-stone-900">
          {alreadySubmitted
            ? "Submit another payment request"
            : "Submit payment request"}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {alreadySubmitted
            ? "Creates a separate AP Form in Lark — choose down payment or balance only if needed."
            : "Creates an AP Form (应付单) in Lark with this PO PDF attached."}
        </p>
        {alreadySubmitted ? (
          <button
            type="button"
            onClick={() => setShowSubmitForm(false)}
            className="mt-2 text-xs font-medium text-stone-600 underline hover:text-stone-900"
          >
            Cancel
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowSubmitForm(false);
                setError(null);
              }}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={openLinkForm}
              className="rounded-md border border-stone-900 bg-white px-3 py-1.5 text-xs font-medium text-stone-900 hover:bg-stone-50"
            >
              Link existing AP Form instead
            </button>
          </div>
        )}
        {!currencyOk ? (
          <p className="mt-2 text-sm text-amber-800">
            Lark AP Form only supports IDR, USD, or CNY. Change the PO currency
            before submitting.
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-xs font-medium text-stone-600">
            AP date (应付日期)
            <input
              type="date"
              value={apDate}
              onChange={(e) => setApDate(e.target.value)}
              disabled={!currencyOk}
              className={fieldClass}
            />
          </label>

          <label className="block text-xs font-medium text-stone-600">
            Brand
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value as ApBrandValue)}
              disabled={!currencyOk}
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
              disabled={!currencyOk}
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
              placeholder="e.g. RESTOCKING"
              disabled={!currencyOk}
              className={fieldClass}
            />
          </label>

          <label className="block text-xs font-medium text-stone-600">
            Supplier{" "}
            <span className="font-normal text-stone-400">(optional)</span>
            <textarea
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              rows={8}
              placeholder="Supplier name and payment / banking details"
              disabled={!currencyOk}
              className={`${fieldClass} resize-y font-mono text-xs`}
            />
            <span className="mt-0.5 block text-[11px] font-normal text-stone-500">
              Prefills from the PO supplier&apos;s payment details. Edit before
              submit if needed.
            </span>
          </label>

          {planRows.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-stone-600">
                Payment plan (付款计划)
              </p>
              {hasSplitPlan ? (
                <label className="mt-1.5 block text-[11px] text-stone-500">
                  Include in this AP Form
                  <select
                    value={paymentPlanScope}
                    onChange={(e) =>
                      applyPaymentPlanScope(
                        e.target.value as ApPaymentPlanScope,
                      )
                    }
                    disabled={!currencyOk}
                    className={fieldClass}
                  >
                    {AP_PAYMENT_PLAN_SCOPES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p className="mt-1 text-[11px] text-stone-500">
                {hasSplitPlan
                  ? "Only the selected payment amount is submitted — other AP fields stay the same."
                  : "Prefills from PO totals — edit before submit."}
              </p>
              <div className="mt-1.5 space-y-2">
                {planRows.map((row, index) => (
                  <div
                    key={`${row.dateYmd}-${index}`}
                    className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 space-y-2"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-[11px] text-stone-500">
                        Date
                        <input
                          type="date"
                          value={row.dateYmd}
                          onChange={(e) =>
                            updatePlanRow(index, { dateYmd: e.target.value })
                          }
                          disabled={!currencyOk}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block text-[11px] text-stone-500">
                        Amount ({row.currency})
                        <input
                          type="number"
                          step="any"
                          value={row.amount}
                          onChange={(e) =>
                            updatePlanRow(index, {
                              amount: Number(e.target.value) || 0,
                            })
                          }
                          disabled={!currencyOk}
                          className={fieldClass}
                        />
                      </label>
                    </div>
                    <label className="block text-[11px] text-stone-500">
                      Remarks · {formatPoMoney(row.amount, row.currency)}
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={(e) =>
                          updatePlanRow(index, { remarks: e.target.value })
                        }
                        disabled={!currencyOk}
                        className={fieldClass}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <label className="block text-xs font-medium text-stone-600">
            Remarks{" "}
            <span className="font-normal text-stone-400">(optional)</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              placeholder="Details for the AP form remarks…"
              disabled={!currencyOk}
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
                yet. Ask an admin to add your email → open_id.
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
                  disabled={!currencyOk}
                  className={fieldClass}
                />
                <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-md border border-stone-300 p-1.5">
                  {filteredApprovers.length === 0 ? (
                    <li className="px-1.5 py-1 text-xs text-stone-500">
                      No matches for “{approverQuery.trim()}”
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
                              onChange={() => toggleApprover(openId)}
                              disabled={!currencyOk}
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
            {selectedApproverIds.length > 0 ? (
              <p className="mt-1 text-[11px] text-stone-500">
                {selectedApproverIds.length} selected
              </p>
            ) : null}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-stone-600">
                Attachments (附件)
              </p>
              <p className="text-[11px] font-medium text-stone-900">
                {1 + extraFiles.length} file
                {1 + extraFiles.length === 1 ? "" : "s"}
              </p>
            </div>
            <p className="mt-0.5 text-[11px] text-stone-500">
              PO PDF is always included automatically. Add invoices, images, or
              other files (max 10 extra, {formatBytes(MAX_TOTAL_EXTRA_BYTES)}{" "}
              total).
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
                  ? "No extra files selected yet"
                  : `${extraFiles.length} extra file${extraFiles.length === 1 ? "" : "s"} selected`}
              </span>
              <input
                id={fileInputId}
                type="file"
                multiple
                disabled={busy || !currencyOk || extraFiles.length >= 10}
                className="mt-1 block w-full cursor-pointer text-xs text-stone-600 file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-stone-900 file:px-2 file:py-1 file:text-xs file:font-medium file:text-white"
                onChange={(e) => {
                  addExtraFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>

            <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-md border border-stone-300 bg-white p-1.5">
              <li className="flex items-center justify-between gap-2 rounded bg-stone-50 px-1.5 py-1 text-xs text-stone-900">
                <span className="min-w-0 truncate font-medium">
                  {po.po_number || "PO"}.pdf
                  <span className="ml-1 font-normal text-stone-500">
                    · auto
                  </span>
                </span>
              </li>
              {extraFiles.length === 0 ? (
                <li className="px-1.5 py-1 text-[11px] text-stone-500">
                  Extra files you choose will appear here.
                </li>
              ) : (
                extraFiles.map((file, index) => (
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
                      onClick={() => removeExtraFile(index)}
                      className="shrink-0 text-stone-500 underline hover:text-red-700"
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))
              )}
            </ul>
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
            !currencyOk ||
            !hasMyOpenId ||
            selectedApproverIds.length === 0 ||
            loadingPeople ||
            planRows.length === 0
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
