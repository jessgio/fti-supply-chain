import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  isApExpenseCategoryValue,
  isApPaymentPlanScope,
  type ApExpenseCategoryValue,
  type ApPaymentPlanScope,
} from "@/lib/lark/ap-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";
import type { PurchaseOrderLarkSubmission } from "@/types/database";

export const runtime = "nodejs";

/**
 * Update local metadata on a linked/submitted Lark AP Form row
 * (payment scope, expense category). Does not change anything in Lark.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; submissionId: string }> },
) {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const { id: poId, submissionId } = await context.params;
  if (!submissionId || submissionId === "legacy") {
    return NextResponse.json(
      { error: "This submission cannot be edited" },
      { status: 400 },
    );
  }

  let body: {
    paymentScope?: unknown;
    expenseCategory?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const patch: {
    payment_scope?: ApPaymentPlanScope;
    lark_expense_category?: ApExpenseCategoryValue | null;
  } = {};

  if (body.paymentScope !== undefined) {
    if (
      typeof body.paymentScope !== "string" ||
      !isApPaymentPlanScope(body.paymentScope)
    ) {
      return NextResponse.json(
        { error: "Invalid payment scope" },
        { status: 400 },
      );
    }
    patch.payment_scope = body.paymentScope;
  }

  if (body.expenseCategory !== undefined) {
    if (body.expenseCategory === null || body.expenseCategory === "") {
      patch.lark_expense_category = null;
    } else if (
      typeof body.expenseCategory === "string" &&
      isApExpenseCategoryValue(body.expenseCategory)
    ) {
      patch.lark_expense_category = body.expenseCategory;
    } else {
      return NextResponse.json(
        { error: "Invalid expense category" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: existing, error: findErr } = await supabase
    .from("purchase_order_lark_submissions")
    .select("id, purchase_order_id")
    .eq("id", submissionId)
    .eq("purchase_order_id", poId)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Submission not found on this PO" },
      { status: 404 },
    );
  }

  try {
    const { data: updated, error: updateErr } = await supabase
      .from("purchase_order_lark_submissions")
      .update(patch)
      .eq("id", submissionId)
      .select("*")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Keep PO badge expense category in sync when editing the latest row.
    if (patch.lark_expense_category !== undefined) {
      const { data: latest } = await supabase
        .from("purchase_order_lark_submissions")
        .select("id, lark_expense_category")
        .eq("purchase_order_id", poId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest?.id === submissionId) {
        await supabase
          .from("purchase_orders")
          .update({
            lark_expense_category: patch.lark_expense_category,
          })
          .eq("id", poId);
      }
    }

    return NextResponse.json({
      submission: updated as PurchaseOrderLarkSubmission,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Failed to update submission" },
      { status: 500 },
    );
  }
}

/**
 * Remove a Lark AP Form link from this PO. Does not cancel/delete the form in Lark.
 * Pass submissionId=legacy to clear PO badge fields when only legacy columns exist.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; submissionId: string }> },
) {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const { id: poId, submissionId } = await context.params;
  if (!submissionId) {
    return NextResponse.json(
      { error: "Submission id is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  try {
    if (submissionId !== "legacy") {
      const { data: existing, error: findErr } = await supabase
        .from("purchase_order_lark_submissions")
        .select("id, purchase_order_id")
        .eq("id", submissionId)
        .eq("purchase_order_id", poId)
        .maybeSingle();

      if (findErr) {
        return NextResponse.json({ error: findErr.message }, { status: 500 });
      }
      if (!existing) {
        return NextResponse.json(
          { error: "Submission not found on this PO" },
          { status: 404 },
        );
      }

      const { error: deleteErr } = await supabase
        .from("purchase_order_lark_submissions")
        .delete()
        .eq("id", submissionId)
        .eq("purchase_order_id", poId);

      if (deleteErr) {
        return NextResponse.json({ error: deleteErr.message }, { status: 500 });
      }
    } else {
      // Legacy: clear any history rows that match the PO's current instance code,
      // then clear badge columns below.
      const { data: po } = await supabase
        .from("purchase_orders")
        .select("lark_instance_code")
        .eq("id", poId)
        .maybeSingle();

      if (po?.lark_instance_code) {
        await supabase
          .from("purchase_order_lark_submissions")
          .delete()
          .eq("purchase_order_id", poId)
          .eq("lark_instance_code", po.lark_instance_code);
      }
    }

    const { data: remainingRows, error: remainErr } = await supabase
      .from("purchase_order_lark_submissions")
      .select("*")
      .eq("purchase_order_id", poId)
      .order("submitted_at", { ascending: false });

    if (remainErr) {
      return NextResponse.json({ error: remainErr.message }, { status: 500 });
    }

    const remaining = (remainingRows ?? []) as PurchaseOrderLarkSubmission[];
    const latest = remaining[0] ?? null;

    const { error: updateErr } = await supabase
      .from("purchase_orders")
      .update(
        latest
          ? {
              lark_instance_code: latest.lark_instance_code,
              lark_serial_number: latest.lark_serial_number,
              lark_approval_status: latest.lark_approval_status,
              lark_status_synced_at: latest.lark_status_synced_at,
              lark_submitted_at: latest.submitted_at,
              lark_expense_category: latest.lark_expense_category,
            }
          : {
              lark_instance_code: null,
              lark_serial_number: null,
              lark_approval_status: null,
              lark_status_synced_at: null,
              lark_submitted_at: null,
              lark_expense_category: null,
            },
      )
      .eq("id", poId);

    if (updateErr) {
      return NextResponse.json(
        {
          error: `Removed link but failed to update PO: ${updateErr.message}`,
        },
        { status: 500 },
      );
    }

    const purchaseOrder = await getPurchaseOrder(supabase, poId);

    return NextResponse.json({
      removedSubmissionId: submissionId,
      submissions: remaining,
      purchaseOrder,
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Failed to remove link" },
      { status: 500 },
    );
  }
}
