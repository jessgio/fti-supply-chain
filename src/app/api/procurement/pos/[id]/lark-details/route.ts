import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { isLarkApprovalStatus } from "@/lib/lark/ap-form";
import {
  getApprovalInstanceDetails,
  type ApprovalInstanceComment,
} from "@/lib/lark/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { PurchaseOrderLarkSubmission } from "@/types/database";

export const runtime = "nodejs";

type CommentWithAuthor = ApprovalInstanceComment & {
  authorName: string | null;
  authorEmail: string | null;
};

async function attachCommentAuthors(
  comments: ApprovalInstanceComment[],
): Promise<CommentWithAuthor[]> {
  if (comments.length === 0) return [];

  try {
    const supabase = createAdminClient();
    const { data: directory } = await supabase
      .from("lark_user_directory")
      .select("email, lark_open_id, display_name");

    const byOpenId = new Map<string, { name: string; email: string }>();
    for (const row of directory ?? []) {
      const openId = row.lark_open_id?.trim();
      if (!openId) continue;
      const existing = byOpenId.get(openId);
      const name = row.display_name?.trim() || "";
      if (!existing || (!existing.name && name)) {
        byOpenId.set(openId, { name, email: row.email });
      }
    }

    return comments.map((comment) => {
      const match = comment.openId ? byOpenId.get(comment.openId) : undefined;
      return {
        ...comment,
        authorName: match?.name || null,
        authorEmail: match?.email || null,
      };
    });
  } catch {
    return comments.map((comment) => ({
      ...comment,
      authorName: null,
      authorEmail: null,
    }));
  }
}

/**
 * Sync Lark AP status + comments. Optional ?submissionId= targets one history row;
 * otherwise syncs all submissions for the PO and returns them.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireReadRole();
  if (denied) return denied;

  const { id } = await context.params;
  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submissionId")?.trim() || null;
  const supabase = createAdminClient();

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, lark_instance_code, lark_serial_number, lark_approval_status, lark_status_synced_at",
    )
    .eq("id", id)
    .single();

  if (error || !po) {
    return NextResponse.json(
      { error: error?.message ?? "Purchase order not found" },
      { status: 404 },
    );
  }

  const { data: submissionRows, error: subErr } = await supabase
    .from("purchase_order_lark_submissions")
    .select("*")
    .eq("purchase_order_id", id)
    .order("submitted_at", { ascending: false });

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  let submissions = (submissionRows ?? []) as PurchaseOrderLarkSubmission[];

  // Legacy: PO has instance code but no history row yet.
  if (
    submissions.length === 0 &&
    po.lark_instance_code
  ) {
    submissions = [
      {
        id: "legacy",
        purchase_order_id: po.id,
        lark_instance_code: po.lark_instance_code,
        lark_serial_number: po.lark_serial_number,
        lark_approval_status: po.lark_approval_status as PurchaseOrderLarkSubmission["lark_approval_status"],
        lark_status_synced_at: po.lark_status_synced_at,
        payment_scope: "both",
        lark_expense_category: null,
        submitted_at: po.lark_status_synced_at ?? new Date().toISOString(),
      },
    ];
  }

  if (submissions.length === 0) {
    return NextResponse.json(
      { error: "PO has not been submitted to Lark", submissions: [] },
      { status: 404 },
    );
  }

  const targets = submissionId
    ? submissions.filter((s) => s.id === submissionId)
    : submissions;

  if (submissionId && targets.length === 0) {
    return NextResponse.json(
      { error: "Submission not found" },
      { status: 404 },
    );
  }

  try {
    let focusComments: CommentWithAuthor[] = [];
    let focusSerial: string | null = null;
    let focusStatus: string | null = null;
    let focusSyncedAt: string | null = null;
    let focusInstance: string | null = null;

    const updatedSubmissions: PurchaseOrderLarkSubmission[] = [];

    for (const sub of targets) {
      const details = await getApprovalInstanceDetails(sub.lark_instance_code, {
        retries: 1,
      });
      const serialNumber =
        details.serialNumber || sub.lark_serial_number || null;
      const status = isLarkApprovalStatus(details.status)
        ? details.status
        : sub.lark_approval_status;
      const syncedAt = new Date().toISOString();
      const comments = await attachCommentAuthors(details.comments);

      if (sub.id !== "legacy") {
        await supabase
          .from("purchase_order_lark_submissions")
          .update({
            lark_serial_number: serialNumber,
            lark_approval_status: status,
            lark_status_synced_at: syncedAt,
          })
          .eq("id", sub.id);
      }

      const next: PurchaseOrderLarkSubmission = {
        ...sub,
        lark_serial_number: serialNumber,
        lark_approval_status: status,
        lark_status_synced_at: syncedAt,
      };
      updatedSubmissions.push(next);

      // Prefer the requested submission, else the latest (first in desc order).
      if (!focusInstance) {
        focusInstance = sub.lark_instance_code;
        focusSerial = serialNumber;
        focusStatus = status;
        focusSyncedAt = syncedAt;
        focusComments = comments;
      }
    }

    // Merge synced rows back into full list for response.
    const byId = new Map(updatedSubmissions.map((s) => [s.id, s]));
    const allSubmissions = submissions.map((s) => byId.get(s.id) ?? s);

    // Keep PO badge columns aligned with the latest submission.
    const latest = allSubmissions[0];
    if (latest) {
      await supabase
        .from("purchase_orders")
        .update({
          lark_instance_code: latest.lark_instance_code,
          lark_serial_number: latest.lark_serial_number,
          lark_approval_status: latest.lark_approval_status,
          lark_status_synced_at: latest.lark_status_synced_at,
        })
        .eq("id", po.id);
    }

    return NextResponse.json({
      instanceCode: focusInstance,
      serialNumber: focusSerial,
      status: focusStatus,
      syncedAt: focusSyncedAt,
      comments: focusComments,
      submissions: allSubmissions,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: errorMessage(err) || "Failed to fetch Lark details",
        instanceCode: po.lark_instance_code,
        serialNumber: po.lark_serial_number,
        status: po.lark_approval_status,
        syncedAt: po.lark_status_synced_at,
        comments: [],
        submissions,
      },
      { status: 502 },
    );
  }
}
