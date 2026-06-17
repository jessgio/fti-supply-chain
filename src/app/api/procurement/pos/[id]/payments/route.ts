import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPoPayment } from "@/lib/db/procurement";
import { isValidPoCurrency } from "@/lib/procurement/currencies";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();

    const amount = Number(body?.amount);
    const paymentRequestNumber = String(body?.payment_request_number ?? "").trim();
    const purpose = String(body?.purpose ?? "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "A positive payment amount is required." },
        { status: 400 },
      );
    }
    if (!paymentRequestNumber) {
      return NextResponse.json(
        { error: "Payment request number is required." },
        { status: 400 },
      );
    }
    if (!purpose) {
      return NextResponse.json(
        { error: "Payment purpose is required." },
        { status: 400 },
      );
    }

    const currency = body?.currency != null ? String(body.currency) : undefined;
    if (currency !== undefined && !isValidPoCurrency(currency)) {
      return NextResponse.json(
        { error: "A valid currency code is required." },
        { status: 400 },
      );
    }

    const exchangeRate =
      body?.exchange_rate != null ? Number(body.exchange_rate) : null;
    if (
      exchangeRate != null &&
      (!Number.isFinite(exchangeRate) || exchangeRate <= 0)
    ) {
      return NextResponse.json(
        { error: "Exchange rate must be a positive number." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const purchaseOrder = await createPoPayment(supabase, id, {
      payment_date: body?.payment_date ?? undefined,
      amount,
      payment_request_number: paymentRequestNumber,
      currency,
      exchange_rate: exchangeRate,
      purpose,
    });

    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
