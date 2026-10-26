import { requireReadRole } from "@/lib/auth";
import { handleLarkCommentFileRequest } from "@/lib/lark/comment-file-route";
import { purchaseOrderOwnsLarkInstance } from "@/lib/lark/po-lark-access";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireReadRole();
  if (denied) return denied;

  const { id } = await context.params;
  return handleLarkCommentFileRequest(request, (instanceCode) =>
    purchaseOrderOwnsLarkInstance(id, instanceCode),
  );
}
