import { NextResponse } from "next/server";
import { getCurrentProfile, requireWriteRole } from "@/lib/auth";
import {
  AP_EXTRA_FILES_MAX_COUNT,
  AP_EXTRA_FILE_MAX_BYTES,
  AP_EXTRA_FILES_MAX_TOTAL_BYTES,
  AP_FORM_APPROVER_NODE_ID,
  DEFAULT_AP_BRAND,
  DEFAULT_AP_EXPENSE_CATEGORY,
  isApBrandValue,
  isApExpenseCategoryValue,
  isApFormCurrency,
  isApShipmentExtraStoragePath,
  isLarkApprovalStatus,
  buildApFormControls,
  stringifyApForm,
  type ApBrandValue,
  type ApExpenseCategoryValue,
  type PaymentPlanRow,
} from "@/lib/lark/ap-form";
import { isShipmentApInvoiceKind } from "@/lib/lark/shipment-ap";
import { sumPlanRowAmounts } from "@/lib/procurement/committed-payment-amounts";
import {
  createApprovalInstance,
  getApprovalInstanceDetails,
  getLarkApprovalCode,
  uploadApprovalAttachment,
} from "@/lib/lark/client";
import { insertShipmentLarkSubmission } from "@/lib/db/shipment-lark";
import { getShipment } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_EXTRA_FILES = AP_EXTRA_FILES_MAX_COUNT;
const MAX_FILE_BYTES = AP_EXTRA_FILE_MAX_BYTES;
const MAX_TOTAL_EXTRA_BYTES = AP_EXTRA_FILES_MAX_TOTAL_BYTES;

function normalizeOpenIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => /^ou_[a-zA-Z0-9]+$/.test(v)),
    ),
  ];
}

function parseApproverOpenIds(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return normalizeOpenIds(JSON.parse(raw) as unknown);
  } catch {
    return normalizeOpenIds(raw.split(",").map((s) => s.trim()));
  }
}

function parsePlanRows(raw: FormDataEntryValue | null): PaymentPlanRow[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const rows: PaymentPlanRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const dateYmd =
        typeof row.dateYmd === "string" ? row.dateYmd.trim().slice(0, 10) : "";
      const amount = Number(row.amount);
      const currency =
        typeof row.currency === "string" ? row.currency.trim().toUpperCase() : "";
      const remarks = typeof row.remarks === "string" ? row.remarks : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) continue;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!isApFormCurrency(currency)) continue;
      rows.push({ dateYmd, amount, currency, remarks });
    }
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

type StoredExtra = {
  path: string;
  filename: string;
  fileSize: number;
};

function parseStoredExtras(
  raw: FormDataEntryValue | null,
  shipmentId: string,
): StoredExtra[] | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: "Invalid extra attachment list" };
    }
    if (parsed.length > MAX_EXTRA_FILES) {
      return { error: `At most ${MAX_EXTRA_FILES} extra files allowed` };
    }
    const extras: StoredExtra[] = [];
    let total = 0;
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const path = typeof row.path === "string" ? row.path.trim() : "";
      const filename =
        typeof row.filename === "string" && row.filename.trim()
          ? row.filename.trim()
          : "attachment";
      const fileSize = Number(row.fileSize);
      if (!isApShipmentExtraStoragePath(shipmentId, path)) {
        return { error: "Invalid extra attachment path" };
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return { error: `Invalid size for ${filename}` };
      }
      if (fileSize > MAX_FILE_BYTES) {
        return {
          error: `File too large: ${filename} (max ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB each)`,
        };
      }
      total += fileSize;
      extras.push({ path, filename, fileSize });
    }
    if (total > MAX_TOTAL_EXTRA_BYTES) {
      return {
        error: `Extra attachments total too large (max ${Math.floor(MAX_TOTAL_EXTRA_BYTES / (1024 * 1024))} MB).`,
      };
    }
    return extras;
  } catch {
    return { error: "Invalid extra attachment list" };
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const profile = await getCurrentProfile();
  if (!profile?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const kindRaw = formData.get("invoiceKind");
  const invoiceKind =
    typeof kindRaw === "string" && isShipmentApInvoiceKind(kindRaw)
      ? kindRaw
      : null;
  if (!invoiceKind) {
    return NextResponse.json({ error: "Choose tax or shipping invoice" }, { status: 400 });
  }

  const expenseRaw = formData.get("expenseCategory");
  const expenseCategory: ApExpenseCategoryValue =
    typeof expenseRaw === "string" && isApExpenseCategoryValue(expenseRaw)
      ? expenseRaw
      : DEFAULT_AP_EXPENSE_CATEGORY;

  const brandRaw = formData.get("brand");
  const brand: ApBrandValue =
    typeof brandRaw === "string" && isApBrandValue(brandRaw)
      ? brandRaw
      : DEFAULT_AP_BRAND;

  const apDateRaw = formData.get("apDate");
  const apDateYmd =
    typeof apDateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(apDateRaw.trim())
      ? apDateRaw.trim()
      : null;

  const project =
    typeof formData.get("project") === "string"
      ? String(formData.get("project"))
      : "";
  const supplier =
    typeof formData.get("supplier") === "string"
      ? String(formData.get("supplier"))
      : "";
  const remarks =
    typeof formData.get("remarks") === "string"
      ? String(formData.get("remarks"))
      : "";
  const supplierIdRaw = formData.get("supplierId");
  const supplierId =
    typeof supplierIdRaw === "string" && supplierIdRaw.trim()
      ? supplierIdRaw.trim()
      : null;

  if (invoiceKind === "shipping" && !supplierId) {
    return NextResponse.json(
      { error: "Select a supplier for the shipping invoice" },
      { status: 400 },
    );
  }

  const planRows = parsePlanRows(formData.get("planRows"));
  if (!planRows) {
    return NextResponse.json(
      { error: "Add at least one payment plan row" },
      { status: 400 },
    );
  }

  const approverOpenIds = parseApproverOpenIds(formData.get("approverOpenIds"));
  if (approverOpenIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one Lark approver" },
      { status: 400 },
    );
  }

  const extraEntries = parseStoredExtras(formData.get("storagePaths"), id);
  if (!Array.isArray(extraEntries)) {
    return NextResponse.json({ error: extraEntries.error }, { status: 400 });
  }

  const supabase = createAdminClient();
  const submitterEmail = profile.email.toLowerCase();
  const { data: directoryRow } = await supabase
    .from("lark_user_directory")
    .select("lark_open_id")
    .eq("email", submitterEmail)
    .maybeSingle();

  const submitterOpenId = directoryRow?.lark_open_id?.trim() || null;
  if (!submitterOpenId) {
    return NextResponse.json(
      {
        error:
          "Your email is not mapped in Lark users yet. Ask an admin to add your email → open_id under Lark users.",
        code: "MISSING_SUBMITTER_OPEN_ID",
      },
      { status: 400 },
    );
  }

  const shipment = await getShipment(supabase, id);
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  try {
    const attachmentCodes: string[] = [];
    const extraPaths = extraEntries.map((f) => f.path);
    try {
      for (const extra of extraEntries) {
        const { data: blob, error: downloadError } = await supabase.storage
          .from("data-uploads")
          .download(extra.path);
        if (downloadError) throw downloadError;
        if (!blob) throw new Error(`Missing attachment ${extra.filename}`);
        attachmentCodes.push(
          await uploadApprovalAttachment({
            filename: extra.filename,
            bytes: await blob.arrayBuffer(),
            kind: "attachment",
          }),
        );
      }
    } finally {
      if (extraPaths.length > 0) {
        await supabase.storage.from("data-uploads").remove(extraPaths);
      }
    }

    const formControls = buildApFormControls({
      expenseCategory,
      brand,
      apDateYmd,
      ownerOpenId: submitterOpenId,
      project,
      supplier,
      remarks,
      planRows,
      attachmentCodes,
    });

    const submittedAmount = sumPlanRowAmounts(planRows);
    const submittedCurrency = planRows[0]?.currency ?? "IDR";
    const planRowsSnapshot = planRows.map((row) => ({
      dateYmd: row.dateYmd,
      amount: row.amount,
      currency: row.currency,
      remarks: row.remarks,
    }));

    const result = await createApprovalInstance({
      approvalCode: getLarkApprovalCode(),
      openId: submitterOpenId,
      form: stringifyApForm(formControls),
      uuid: crypto.randomUUID(),
      nodeApproverOpenIdList: [
        { key: AP_FORM_APPROVER_NODE_ID, value: approverOpenIds },
      ],
    });

    const details = await getApprovalInstanceDetails(result.instance_code);
    const serialNumber = details.serialNumber;
    const approvalStatus = isLarkApprovalStatus(details.status)
      ? details.status
      : "PENDING";
    const syncedAt = new Date().toISOString();

    await insertShipmentLarkSubmission(supabase, {
      shipment_id: shipment.id,
      invoice_kind: invoiceKind,
      supplier_id: invoiceKind === "shipping" ? supplierId : supplierId ?? null,
      lark_instance_code: result.instance_code,
      lark_serial_number: serialNumber,
      lark_approval_status: approvalStatus,
      lark_status_synced_at: syncedAt,
      lark_expense_category: expenseCategory,
      submitted_amount: submittedAmount,
      submitted_currency: submittedCurrency,
      plan_rows: planRowsSnapshot,
      submitted_at: syncedAt,
    });

    return NextResponse.json({
      instanceCode: result.instance_code,
      serialNumber,
      status: approvalStatus,
      submittedAt: syncedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Lark submit failed" },
      { status: 502 },
    );
  }
}
