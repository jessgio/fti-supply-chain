import { NextResponse } from "next/server";
import { requireWriteRole, getCurrentProfile } from "@/lib/auth";
import {
  AP_FORM_APPROVER_NODE_ID,
  DEFAULT_AP_BRAND,
  DEFAULT_AP_EXPENSE_CATEGORY,
  isApBrandValue,
  isApExpenseCategoryValue,
  isApFormCurrency,
  isApPaymentPlanScope,
  isLarkApprovalStatus,
  buildApFormControls,
  buildPaymentPlanRows,
  stringifyApForm,
  type ApBrandValue,
  type ApExpenseCategoryValue,
  type ApPaymentPlanScope,
  type PaymentPlanRow,
} from "@/lib/lark/ap-form";
import {
  buildCommittedPatchFromAp,
  sumPlanRowAmounts,
} from "@/lib/procurement/committed-payment-amounts";
import {
  createApprovalInstance,
  getApprovalInstanceDetails,
  getLarkApprovalCode,
  uploadApprovalAttachment,
} from "@/lib/lark/client";
import {
  downloadCompanyLogo,
  getCompanySettings,
} from "@/lib/db/company-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseOrder, getSupplier } from "@/lib/db/procurement";
import { generatePoPdf } from "@/lib/procurement/po-pdf";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
/** Lark upload + approval create can exceed the default serverless limit. */
export const maxDuration = 120;

const MAX_EXTRA_FILES = 10;
/** Keep under Vercel's ~4.5MB request body limit (PO PDF is generated server-side). */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_EXTRA_BYTES = 4 * 1024 * 1024;

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
      if (!Number.isFinite(amount) || amount < 0) continue;
      if (!isApFormCurrency(currency)) continue;
      rows.push({ dateYmd, amount, currency, remarks });
    }
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
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

  const projectRaw = formData.get("project");
  const project = typeof projectRaw === "string" ? projectRaw : "";

  const supplierRaw = formData.get("supplier");
  const supplier = typeof supplierRaw === "string" ? supplierRaw : "";

  const remarksRaw = formData.get("remarks");
  const remarks = typeof remarksRaw === "string" ? remarksRaw : "";

  let planRemarks: string[] | undefined;
  const planRemarksRaw = formData.get("planRemarks");
  if (typeof planRemarksRaw === "string" && planRemarksRaw.trim()) {
    try {
      const parsed = JSON.parse(planRemarksRaw) as unknown;
      if (Array.isArray(parsed)) {
        planRemarks = parsed.map((v) =>
          typeof v === "string" ? v : String(v ?? ""),
        );
      }
    } catch {
      planRemarks = undefined;
    }
  }

  const planRows = parsePlanRows(formData.get("planRows"));

  const scopeRaw = formData.get("paymentScope");
  const paymentScope: ApPaymentPlanScope =
    typeof scopeRaw === "string" && isApPaymentPlanScope(scopeRaw)
      ? scopeRaw
      : "both";

  const approverOpenIds = parseApproverOpenIds(formData.get("approverOpenIds"));
  if (approverOpenIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one Lark approver" },
      { status: 400 },
    );
  }

  const extraEntries = formData.getAll("files").filter((e): e is File => {
    return e instanceof File && e.size > 0;
  });
  if (extraEntries.length > MAX_EXTRA_FILES) {
    return NextResponse.json(
      { error: `At most ${MAX_EXTRA_FILES} extra files allowed` },
      { status: 400 },
    );
  }
  let totalExtraBytes = 0;
  for (const f of extraEntries) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File too large: ${f.name} (max ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB each)`,
        },
        { status: 400 },
      );
    }
    totalExtraBytes += f.size;
  }
  if (totalExtraBytes > MAX_TOTAL_EXTRA_BYTES) {
    return NextResponse.json(
      {
        error: `Extra attachments total too large (max ${Math.floor(MAX_TOTAL_EXTRA_BYTES / (1024 * 1024))} MB). Remove some files and try again.`,
      },
      { status: 400 },
    );
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

  const po = await getPurchaseOrder(supabase, id);
  if (!po) {
    return NextResponse.json(
      { error: "Purchase order not found" },
      { status: 404 },
    );
  }

  if (!isApFormCurrency(po.currency ?? "IDR")) {
    return NextResponse.json(
      {
        error: `Lark AP Form does not support currency ${po.currency}. Use IDR, USD, or CNY.`,
      },
      { status: 400 },
    );
  }

  try {
    const attachmentCodes: string[] = [];

    // Generate PO PDF on the server so the browser does not re-upload a large
    // blob (that was exceeding Vercel's request body limit → "Failed to fetch").
    const [company, supplierRecord] = await Promise.all([
      getCompanySettings(supabase),
      po.supplier_id ? getSupplier(supabase, po.supplier_id) : null,
    ]);
    const logo =
      company.logo_path != null
        ? await downloadCompanyLogo(supabase, company.logo_path)
        : null;
    const poPdfBytes = await generatePoPdf({
      po,
      supplier: supplierRecord,
      company,
      logo,
    });
    const poPdfName = `${po.po_number || "PO"}.pdf`;
    attachmentCodes.push(
      await uploadApprovalAttachment({
        filename: poPdfName,
        bytes: poPdfBytes,
        kind: "attachment",
      }),
    );

    for (const file of extraEntries) {
      attachmentCodes.push(
        await uploadApprovalAttachment({
          filename: file.name || "attachment",
          bytes: await fileToBytes(file),
          kind: "attachment",
        }),
      );
    }

    const formControls = buildApFormControls({
      po,
      expenseCategory,
      brand,
      apDateYmd,
      ownerOpenId: submitterOpenId,
      project,
      supplier,
      remarks,
      planRows,
      planRemarks,
      attachmentCodes,
    });

    const effectivePlanRows =
      planRows ?? buildPaymentPlanRows(po, paymentScope);
    const submittedAmount = sumPlanRowAmounts(effectivePlanRows);
    const submittedCurrency =
      effectivePlanRows[0]?.currency ?? po.currency ?? "IDR";
    const planRowsSnapshot = effectivePlanRows.map((row) => ({
      dateYmd: row.dateYmd,
      amount: row.amount,
      currency: row.currency,
      remarks: row.remarks,
    }));
    const committedPatch = buildCommittedPatchFromAp(
      po,
      paymentScope,
      effectivePlanRows,
    );

    const result = await createApprovalInstance({
      approvalCode: getLarkApprovalCode(),
      openId: submitterOpenId,
      form: stringifyApForm(formControls),
      // Unique per submission so DP and balance can both be filed for one PO.
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

    const { error: insertErr } = await supabase
      .from("purchase_order_lark_submissions")
      .insert({
        purchase_order_id: po.id,
        lark_instance_code: result.instance_code,
        lark_serial_number: serialNumber,
        lark_approval_status: approvalStatus,
        lark_status_synced_at: syncedAt,
        payment_scope: paymentScope,
        lark_expense_category: expenseCategory,
        submitted_amount: submittedAmount,
        submitted_currency: submittedCurrency,
        plan_rows: planRowsSnapshot,
        submitted_at: syncedAt,
      });

    if (insertErr) {
      return NextResponse.json(
        {
          error: `Submitted to Lark (${result.instance_code}) but failed to save submission history: ${insertErr.message}`,
          instanceCode: result.instance_code,
          serialNumber,
          status: approvalStatus,
        },
        { status: 500 },
      );
    }

    // Keep PO columns as the latest submission for list/detail badges.
    const { error: updateErr } = await supabase
      .from("purchase_orders")
      .update({
        lark_instance_code: result.instance_code,
        lark_serial_number: serialNumber,
        lark_approval_status: approvalStatus,
        lark_status_synced_at: syncedAt,
        lark_submitted_at: syncedAt,
        lark_expense_category: expenseCategory,
        ...(committedPatch ?? {}),
      })
      .eq("id", po.id);

    if (updateErr) {
      return NextResponse.json(
        {
          error: `Submitted to Lark (${result.instance_code}) but failed to save on PO: ${updateErr.message}`,
          instanceCode: result.instance_code,
          serialNumber,
          status: approvalStatus,
        },
        { status: 500 },
      );
    }

    const updated = await getPurchaseOrder(supabase, po.id);

    return NextResponse.json({
      instanceCode: result.instance_code,
      serialNumber,
      status: approvalStatus,
      submittedAt: syncedAt,
      expenseCategory,
      paymentScope,
      brand,
      approverOpenIds,
      attachmentCount: attachmentCodes.length,
      purchaseOrder: updated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Lark submit failed" },
      { status: 502 },
    );
  }
}
