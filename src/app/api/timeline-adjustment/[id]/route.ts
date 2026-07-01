import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  deleteProductTimeline,
  getProductTimeline,
  updateProductTimeline,
} from "@/lib/db/timeline-adjustment";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { productTimelineBodySchema } from "@/lib/timeline-adjustment/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await params;
    const timeline = await getProductTimeline(createAdminClient(), id);
    if (!timeline) {
      return NextResponse.json({ error: "Timeline not found." }, { status: 404 });
    }

    return NextResponse.json({ timeline });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const parsed = productTimelineBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const existing = await getProductTimeline(createAdminClient(), id);
    if (!existing) {
      return NextResponse.json({ error: "Timeline not found." }, { status: 404 });
    }

    const timeline = await updateProductTimeline(
      createAdminClient(),
      id,
      parsed.data,
    );

    return NextResponse.json({ timeline });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const existing = await getProductTimeline(createAdminClient(), id);
    if (!existing) {
      return NextResponse.json({ error: "Timeline not found." }, { status: 404 });
    }

    await deleteProductTimeline(createAdminClient(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
