import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  createStatusUpdateReply,
  extractMentionIds,
  listStatusUpdateReplies,
} from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewReplyMentions } from "@/lib/db/notifications";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const replies = await listStatusUpdateReplies(createAdminClient(), id);
    return NextResponse.json({ replies });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    if (!body.body?.trim()) {
      return NextResponse.json(
        { error: "Reply body is required." },
        { status: 400 },
      );
    }

    const mentioned = Array.isArray(body.mentioned_user_ids)
      ? body.mentioned_user_ids
      : extractMentionIds(body.body);

    const reply = await createStatusUpdateReply(createAdminClient(), {
      status_update_id: id,
      body: body.body.trim(),
      author_id: profile.id,
      mentioned_user_ids: mentioned,
    });

    await notifyNewReplyMentions(createAdminClient(), {
      replyId: reply.id,
      statusUpdateId: id,
      body: body.body.trim(),
      mentionedUserIds: mentioned,
      actorId: profile.id,
    });

    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
