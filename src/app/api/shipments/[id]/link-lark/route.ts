import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { insertShipmentLarkSubmission } from "@/lib/db/shipment-lark";
import { getShipment } from "@/lib/db/shipments";
import { errorMessage } from "@/lib/errors";
import {
  isLarkApprovalStatus,
  submittedAmountFromLarkForm,
  type LarkApprovalStatus,
} from "@/lib/lark/ap-form";
import {
  getApprovalInstanceDetails,
  resolveApprovalInstance,
} from "@/lib/lark/client";
import { toClientLarkComments } from "@/lib/lark/comment-files";
import { isShipmentApInvoiceKind } from "@/lib/lark/shipment-ap";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Link an existing Lark AP Form to a shipment tax or shipping invoice by
 * reference number (or instance code / Lark URL). Does not create a new
 * approval — only attaches and syncs status.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const { id } = await context.params;

  let body: {
    referenceNumber?: unknown;
    invoiceKind?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const referenceNumber =
    typeof body.referenceNumber === "string" ? body.referenceNumber.trim() : "";
  if (!referenceNumber) {
    return NextResponse.json(
      { error: "Enter the AP Form reference number" },
      { status: 400 },
    );
  }

  const invoiceKind =
    typeof body.invoiceKind === "string" ? body.invoiceKind.trim() : "";
  if (!isShipmentApInvoiceKind(invoiceKind)) {
    return NextResponse.json(
      { error: "Choose tax or shipping invoice" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const shipment = await getShipment(supabase, id);
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  try {
    const resolved = await resolveApprovalInstance({
      referenceOrCode: referenceNumber,
    });

    const details = await getApprovalInstanceDetails(resolved.instanceCode, {
      retries: 2,
    });
    const serialNumber =
      details.serialNumber || resolved.serialId || referenceNumber.trim();
    const resolvedStatus = resolved.status?.toUpperCase();
    const approvalStatus: LarkApprovalStatus = isLarkApprovalStatus(details.status)
      ? details.status
      : isLarkApprovalStatus(resolvedStatus)
        ? resolvedStatus
        : "PENDING";
    const syncedAt = new Date().toISOString();

    const { data: existingSubmission } = await supabase
      .from("shipment_lark_submissions")
      .select("id, shipment_id")
      .eq("lark_instance_code", resolved.instanceCode)
      .maybeSingle();

    if (existingSubmission) {
      if (existingSubmission.shipment_id === shipment.id) {
        return NextResponse.json(
          {
            error: "This AP Form is already linked to this shipment",
            code: "ALREADY_LINKED",
            instanceCode: resolved.instanceCode,
            serialNumber,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: "This AP Form is already linked to another shipment",
          code: "LINKED_ELSEWHERE",
          instanceCode: resolved.instanceCode,
          serialNumber,
        },
        { status: 409 },
      );
    }

    let linkedPoNumber: string | null = null;
    const { data: poSubmission } = await supabase
      .from("purchase_order_lark_submissions")
      .select("purchase_order_id")
      .eq("lark_instance_code", resolved.instanceCode)
      .maybeSingle();
    if (poSubmission?.purchase_order_id) {
      const { data: linkedPo } = await supabase
        .from("purchase_orders")
        .select("po_number")
        .eq("id", poSubmission.purchase_order_id)
        .maybeSingle();
      linkedPoNumber = linkedPo?.po_number ?? "";
    } else {
      const { data: poByInstance } = await supabase
        .from("purchase_orders")
        .select("po_number")
        .eq("lark_instance_code", resolved.instanceCode)
        .maybeSingle();
      if (poByInstance) linkedPoNumber = poByInstance.po_number ?? "";
    }

    if (linkedPoNumber != null) {
      return NextResponse.json(
        {
          error: linkedPoNumber
            ? `This AP Form is already linked to PO ${linkedPoNumber}`
            : "This AP Form is already linked to a purchase order",
          code: "LINKED_TO_PO",
          instanceCode: resolved.instanceCode,
          serialNumber,
        },
        { status: 409 },
      );
    }

    if (serialNumber) {
      const { data: serialOnShipment } = await supabase
        .from("shipment_lark_submissions")
        .select("shipment_id, shipments(shipment_number)")
        .eq("lark_serial_number", serialNumber)
        .neq("shipment_id", shipment.id)
        .limit(1);

      const otherShipment = serialOnShipment?.[0];
      if (otherShipment) {
        const related = otherShipment.shipments as
          | { shipment_number: string }
          | { shipment_number: string }[]
          | null;
        const shipmentNumber = Array.isArray(related)
          ? related[0]?.shipment_number
          : related?.shipment_number;
        return NextResponse.json(
          {
            error: `Reference ${serialNumber} is already on shipment ${shipmentNumber || otherShipment.shipment_id}`,
            code: "SERIAL_ON_OTHER_SHIPMENT",
            instanceCode: resolved.instanceCode,
            serialNumber,
          },
          { status: 409 },
        );
      }

      const { data: serialOnPo } = await supabase
        .from("purchase_orders")
        .select("id, po_number")
        .eq("lark_serial_number", serialNumber)
        .limit(1);
      const poOwner = serialOnPo?.[0];
      if (poOwner) {
        return NextResponse.json(
          {
            error: `Reference ${serialNumber} is already on PO ${poOwner.po_number || poOwner.id}`,
            code: "SERIAL_ON_PO",
            instanceCode: resolved.instanceCode,
            serialNumber,
          },
          { status: 409 },
        );
      }
    }

    const fromLark = submittedAmountFromLarkForm(details.form, "IDR");
    const planRows = fromLark?.planRows ?? [];
    const planRowsSnapshot =
      planRows.length > 0
        ? planRows.map((row) => ({
            dateYmd: row.dateYmd,
            amount: row.amount,
            currency: row.currency,
            remarks: row.remarks,
          }))
        : null;

    let inserted;
    try {
      inserted = await insertShipmentLarkSubmission(supabase, {
        shipment_id: shipment.id,
        invoice_kind: invoiceKind,
        supplier_id: null,
        lark_instance_code: resolved.instanceCode,
        lark_serial_number: serialNumber,
        lark_approval_status: approvalStatus,
        lark_status_synced_at: syncedAt,
        lark_expense_category: null,
        submitted_amount: fromLark?.amount ?? null,
        submitted_currency: fromLark?.currency ?? null,
        plan_rows: planRowsSnapshot,
        submitted_at: syncedAt,
      });
    } catch (insertErr) {
      const msg = errorMessage(insertErr);
      const code =
        insertErr &&
        typeof insertErr === "object" &&
        "code" in insertErr &&
        (insertErr as { code: unknown }).code === "23505";
      if (
        code ||
        msg.includes("shipment_lark_submissions_instance_uidx") ||
        msg.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json(
          {
            error: "This AP Form is already linked to a shipment",
            code: "LINKED_ELSEWHERE",
            instanceCode: resolved.instanceCode,
            serialNumber,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: `Failed to save link: ${msg}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      instanceCode: resolved.instanceCode,
      serialNumber,
      status: approvalStatus,
      syncedAt,
      invoiceKind,
      submission: inserted,
      comments: toClientLarkComments(details.comments),
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Failed to link Lark AP Form" },
      { status: 502 },
    );
  }
}
