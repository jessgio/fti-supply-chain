import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { addChatMessage, listChatMessages } from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function extractMentions(body: string, profileIds: Set<string>): string[] {
  const mentions: string[] = [];
  const pattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const userId = match[2];
    if (profileIds.has(userId)) mentions.push(userId);
  }
  return [...new Set(mentions)];
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const messages = await listChatMessages(createAdminClient(), id);
    return NextResponse.json({ messages });
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
      return NextResponse.json({ error: "Message body is required." }, { status: 400 });
    }

    const mentioned = Array.isArray(body.mentioned_user_ids)
      ? body.mentioned_user_ids
      : extractMentions(body.body, new Set(body.mentioned_user_ids ?? []));

    const message = await addChatMessage(createAdminClient(), {
      project_id: id,
      body: body.body.trim(),
      author_id: profile.id,
      mentioned_user_ids: mentioned,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
