import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletePoPayment, updatePoPayment } from "@/lib/db/procurement";
import { isValidPoCurrency } from "@/lib/procurement/currencies";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id, paymentId } = await params;
    const body = await request.json();
    const input: {
      payment_date?: string;
      amount?: number;
      payment_request_number?: string;
      currency?: string;
      exchange_rate?: number | null;
      purpose?: string;
    } = {};

    if (body?.payment_date !== undefined) {
      input.payment_date = body.payment_date;
    }
    if (body?.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: "A positive payment amount is required." },
          { status: 400 },
        );
      }
      input.amount = amount;
    }
    if (body?.payment_request_number !== undefined) {
      const trimmed = String(body.payment_request_number).trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Payment request number is required." },
          { status: 400 },
        );
      }
      input.payment_request_number = trimmed;
    }
    if (body?.purpose !== undefined) {
      const trimmed = String(body.purpose).trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Payment purpose is required." },
          { status: 400 },
        );
      }
      input.purpose = trimmed;
    }
    if (body?.currency !== undefined) {
      const currency = String(body.currency);
      if (!isValidPoCurrency(currency)) {
        return NextResponse.json(
          { error: "A valid currency code is required." },
          { status: 400 },
        );
      }
      input.currency = currency;
    }
    if (body?.exchange_rate !== undefined) {
      input.exchange_rate =
        body.exchange_rate == null ? null : Number(body.exchange_rate);
      if (
        input.exchange_rate != null &&
        (!Number.isFinite(input.exchange_rate) || input.exchange_rate <= 0)
      ) {
        return NextResponse.json(
          { error: "Exchange rate must be a positive number." },
          { status: 400 },
        );
      }
    }

    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const purchaseOrder = await updatePoPayment(
      supabase,
      id,
      paymentId,
      input,
    );
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id, paymentId } = await params;
    const supabase = createAdminClient();
    const purchaseOrder = await deletePoPayment(supabase, id, paymentId);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
