import { requireSupplyChainAccess } from "@/lib/auth";
import { listShipmentLarkSubmissions } from "@/lib/db/shipment-lark";
import { handleLarkCommentFileRequest } from "@/lib/lark/comment-file-route";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireSupplyChainAccess();
  if (denied) return denied;

  const { id } = await context.params;
  return handleLarkCommentFileRequest(request, async (instanceCode) => {
    const submissions = await listShipmentLarkSubmissions(
      createAdminClient(),
      id,
    );
    return submissions.some((row) => row.lark_instance_code === instanceCode);
  });
}
