import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  isApFormCurrency,
  isApPaymentPlanScope,
  isLarkApprovalStatus,
  localTodayYmd,
  submittedAmountFromLarkForm,
  type ApPaymentPlanScope,
} from "@/lib/lark/ap-form";
import {
  buildCommittedPatchFromAp,
} from "@/lib/procurement/committed-payment-amounts";
import {
  getApprovalInstanceDetails,
  resolveApprovalInstance,
} from "@/lib/lark/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * Link an existing Lark AP Form to a PO by reference number (or instance code /
 * Lark URL). Does not create a new approval — only attaches + syncs status.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const { id } = await context.params;

  let body: {
    referenceNumber?: unknown;
    paymentScope?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const referenceNumber =
    typeof body.referenceNumber === "string" ? body.referenceNumber.trim() : "";
  if (!referenceNumber) {
    return NextResponse.json(
      { error: "Enter the AP Form reference number" },
      { status: 400 },
    );
  }

  const paymentScope: ApPaymentPlanScope =
    typeof body.paymentScope === "string" &&
    isApPaymentPlanScope(body.paymentScope)
      ? body.paymentScope
      : "both";

  const supabase = createAdminClient();
  const po = await getPurchaseOrder(supabase, id);
  if (!po) {
    return NextResponse.json(
      { error: "Purchase order not found" },
      { status: 404 },
    );
  }

  try {
    const resolved = await resolveApprovalInstance({
      referenceOrCode: referenceNumber,
    });

    const details = await getApprovalInstanceDetails(resolved.instanceCode, {
      retries: 2,
    });
    const serialNumber =
      details.serialNumber || resolved.serialId || referenceNumber.trim();
    const approvalStatus = isLarkApprovalStatus(details.status)
      ? details.status
      : isLarkApprovalStatus(resolved.status?.toUpperCase())
        ? resolved.status!.toUpperCase()
        : "PENDING";
    const syncedAt = new Date().toISOString();

    // Already linked to this PO?
    const { data: existingOnPo } = await supabase
      .from("purchase_order_lark_submissions")
      .select("id, purchase_order_id")
      .eq("lark_instance_code", resolved.instanceCode)
      .maybeSingle();

    if (existingOnPo) {
      if (existingOnPo.purchase_order_id === po.id) {
        return NextResponse.json(
          {
            error: "This AP Form is already linked to this PO",
            code: "ALREADY_LINKED",
            instanceCode: resolved.instanceCode,
            serialNumber,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error:
            "This AP Form is already linked to another purchase order",
          code: "LINKED_ELSEWHERE",
          instanceCode: resolved.instanceCode,
          serialNumber,
        },
        { status: 409 },
      );
    }

    // Serial unique on PO badge column — warn if another PO already shows it.
    if (serialNumber) {
      const { data: serialOwner } = await supabase
        .from("purchase_orders")
        .select("id, po_number")
        .eq("lark_serial_number", serialNumber)
        .neq("id", po.id)
        .maybeSingle();
      if (serialOwner) {
        return NextResponse.json(
          {
            error: `Reference ${serialNumber} is already on PO ${serialOwner.po_number || serialOwner.id}`,
            code: "SERIAL_ON_OTHER_PO",
            instanceCode: resolved.instanceCode,
            serialNumber,
          },
          { status: 409 },
        );
      }
    }

    const fromLark = submittedAmountFromLarkForm(
      details.form,
      po.currency ?? "IDR",
    );
    const planRows = fromLark?.planRows ?? [];
    const submittedAmount = fromLark?.amount ?? null;
    const submittedCurrency =
      fromLark?.currency ?? po.currency ?? "IDR";
    const planRowsSnapshot =
      planRows.length > 0
        ? planRows.map((row) => ({
            dateYmd: row.dateYmd,
            amount: row.amount,
            currency: row.currency,
            remarks: row.remarks,
          }))
        : null;
    const freezeRows =
      planRows.length > 0
        ? planRows
        : fromLark
          ? [
              {
                dateYmd: localTodayYmd(),
                amount: fromLark.amount,
                currency: isApFormCurrency(fromLark.currency)
                  ? fromLark.currency
                  : "IDR",
                remarks: "",
              },
            ]
          : [];
    const committedPatch =
      freezeRows.length > 0
        ? buildCommittedPatchFromAp(po, paymentScope, freezeRows)
        : null;

    const { data: inserted, error: insertErr } = await supabase
      .from("purchase_order_lark_submissions")
      .insert({
        purchase_order_id: po.id,
        lark_instance_code: resolved.instanceCode,
        lark_serial_number: serialNumber,
        lark_approval_status: approvalStatus,
        lark_status_synced_at: syncedAt,
        payment_scope: paymentScope,
        lark_expense_category: null,
        submitted_amount: submittedAmount,
        submitted_currency: submittedCurrency,
        plan_rows: planRowsSnapshot,
        submitted_at: syncedAt,
      })
      .select("*")
      .single();

    if (insertErr) {
      const msg = insertErr.message || "";
      if (
        msg.includes("purchase_order_lark_submissions_instance_uidx") ||
        msg.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json(
          {
            error: "This AP Form is already linked to a purchase order",
            code: "LINKED_ELSEWHERE",
            instanceCode: resolved.instanceCode,
            serialNumber,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: `Failed to save link: ${insertErr.message}` },
        { status: 500 },
      );
    }

    const { error: updateErr } = await supabase
      .from("purchase_orders")
      .update({
        lark_instance_code: resolved.instanceCode,
        lark_serial_number: serialNumber,
        lark_approval_status: approvalStatus,
        lark_status_synced_at: syncedAt,
        lark_submitted_at: syncedAt,
        ...(committedPatch ?? {}),
      })
      .eq("id", po.id);

    if (updateErr) {
      return NextResponse.json(
        {
          error: `Linked in history but failed to update PO: ${updateErr.message}`,
          instanceCode: resolved.instanceCode,
          serialNumber,
          status: approvalStatus,
        },
        { status: 500 },
      );
    }

    const updated = await getPurchaseOrder(supabase, po.id);

    return NextResponse.json({
      instanceCode: resolved.instanceCode,
      serialNumber,
      status: approvalStatus,
      syncedAt,
      paymentScope,
      submission: inserted,
      purchaseOrder: updated,
      comments: details.comments,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Failed to link Lark AP Form" },
      { status: 502 },
    );
  }
}
