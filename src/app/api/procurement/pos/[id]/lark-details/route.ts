import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { isLarkApprovalStatus } from "@/lib/lark/ap-form";
import {
  getApprovalInstanceDetails,
  type ApprovalInstanceComment,
} from "@/lib/lark/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

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
 * Sync Lark AP reference number + approval status + comments for a submitted PO.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireReadRole();
  if (denied) return denied;

  const { id } = await context.params;
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

  if (!po.lark_instance_code) {
    return NextResponse.json(
      { error: "PO has not been submitted to Lark" },
      { status: 404 },
    );
  }

  try {
    const details = await getApprovalInstanceDetails(po.lark_instance_code, {
      retries: 1,
    });

    const serialNumber = details.serialNumber || po.lark_serial_number || null;
    const status = isLarkApprovalStatus(details.status)
      ? details.status
      : po.lark_approval_status;
    const syncedAt = new Date().toISOString();
    const comments = await attachCommentAuthors(details.comments);

    await supabase
      .from("purchase_orders")
      .update({
        lark_serial_number: serialNumber,
        lark_approval_status: status,
        lark_status_synced_at: syncedAt,
      })
      .eq("id", po.id);

    return NextResponse.json({
      instanceCode: po.lark_instance_code,
      serialNumber,
      status,
      syncedAt,
      comments,
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
      },
      { status: 502 },
    );
  }
}
