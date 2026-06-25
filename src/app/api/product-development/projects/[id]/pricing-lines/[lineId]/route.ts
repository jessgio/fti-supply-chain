import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { updatePdPricingLine } from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; lineId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id: projectId, lineId } = await context.params;
    const body = await request.json();

    const patch: {
      amount?: number | null;
      moq?: string | null;
      supplier_id?: string | null;
      offer_note?: string | null;
    } = {};

    if ("amount" in body) {
      const raw = body.amount;
      if (raw === null || raw === "") {
        patch.amount = null;
      } else {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          return NextResponse.json(
            { error: "Amount must be a number." },
            { status: 400 },
          );
        }
        patch.amount = parsed;
      }
    }

    if ("moq" in body) {
      const moq = body.moq;
      patch.moq =
        moq == null || String(moq).trim() === "" ? null : String(moq).trim();
    }

    if ("supplier_id" in body) {
      patch.supplier_id =
        body.supplier_id === "" || body.supplier_id == null
          ? null
          : String(body.supplier_id);
    }

    if ("offer_note" in body) {
      const note = body.offer_note;
      patch.offer_note =
        note == null || String(note).trim() === ""
          ? null
          : String(note).trim();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    await updatePdPricingLine(createAdminClient(), projectId, lineId, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
