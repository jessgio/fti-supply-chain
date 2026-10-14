import { requireReadRole } from "@/lib/auth";
import { handleLarkCommentFileRequest } from "@/lib/lark/comment-file-route";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function poOwnsInstance(
  purchaseOrderId: string,
  instanceCode: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("lark_instance_code")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (po?.lark_instance_code === instanceCode) return true;

  const { data: rows } = await supabase
    .from("purchase_order_lark_submissions")
    .select("id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("lark_instance_code", instanceCode)
    .limit(1);
  return (rows?.length ?? 0) > 0;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireReadRole();
  if (denied) return denied;

  const { id } = await context.params;
  return handleLarkCommentFileRequest(request, (instanceCode) =>
    poOwnsInstance(id, instanceCode),
  );
}
