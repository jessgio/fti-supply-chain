import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { isLarkApprovalStatus, submittedAmountFromLarkForm } from "@/lib/lark/ap-form";
import {
  getApprovalInstanceDetails,
  type ApprovalInstanceComment,
} from "@/lib/lark/client";
import {
  listShipmentLarkSubmissions,
  updateShipmentLarkSubmission,
} from "@/lib/db/shipment-lark";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { ShipmentLarkSubmission } from "@/types/database";

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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireSupplyChainAccess();
  if (denied) return denied;

  const { id } = await context.params;
  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submissionId")?.trim() || null;
  const supabase = createAdminClient();

  let submissions = await listShipmentLarkSubmissions(supabase, id);
  if (submissions.length === 0) {
    return NextResponse.json(
      { error: "No Lark AP submissions for this shipment", submissions: [] },
      { status: 404 },
    );
  }

  const targets = submissionId
    ? submissions.filter((s) => s.id === submissionId)
    : submissions;
  if (submissionId && targets.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  try {
    let focusComments: CommentWithAuthor[] = [];
    let focusSerial: string | null = null;
    let focusStatus: string | null = null;
    let focusSyncedAt: string | null = null;
    let focusInstance: string | null = null;
    const updated: ShipmentLarkSubmission[] = [];

    for (const sub of targets) {
      const details = await getApprovalInstanceDetails(sub.lark_instance_code, {
        retries: 1,
      });
      const serialNumber = details.serialNumber || sub.lark_serial_number || null;
      const status = isLarkApprovalStatus(details.status)
        ? details.status
        : sub.lark_approval_status;
      const syncedAt = new Date().toISOString();
      const comments = await attachCommentAuthors(details.comments);
      const fromLark = submittedAmountFromLarkForm(
        details.form,
        sub.submitted_currency ?? "IDR",
      );
      const amountFields = fromLark
        ? {
            submitted_amount: fromLark.amount,
            submitted_currency: fromLark.currency,
            plan_rows:
              fromLark.planRows.length > 0
                ? fromLark.planRows.map((row) => ({
                    dateYmd: row.dateYmd,
                    amount: row.amount,
                    currency: row.currency,
                    remarks: row.remarks,
                  }))
                : sub.plan_rows,
          }
        : {};

      await updateShipmentLarkSubmission(supabase, sub.id, {
        lark_serial_number: serialNumber,
        lark_approval_status: status,
        lark_status_synced_at: syncedAt,
        ...amountFields,
      });

      const next: ShipmentLarkSubmission = {
        ...sub,
        lark_serial_number: serialNumber,
        lark_approval_status: status,
        lark_status_synced_at: syncedAt,
        ...(amountFields as Partial<ShipmentLarkSubmission>),
      };
      updated.push(next);

      if (!focusInstance) {
        focusInstance = sub.lark_instance_code;
        focusSerial = serialNumber;
        focusStatus = status;
        focusSyncedAt = syncedAt;
        focusComments = comments;
      }
    }

    const byId = new Map(updated.map((s) => [s.id, s]));
    const allSubmissions = submissions.map((s) => byId.get(s.id) ?? s);

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
        submissions,
      },
      { status: 502 },
    );
  }
}
