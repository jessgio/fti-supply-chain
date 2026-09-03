import type { SupabaseClient } from "@supabase/supabase-js";
import { getPurchaseOrder, getSupplier } from "@/lib/db/procurement";
import { getShipment, listShipments } from "@/lib/db/shipments";
import {
  defaultShipmentApProject,
  defaultShipmentApSupplierText,
  formatShipmentPaymentRemarks,
  type ShipmentApInvoiceKind,
} from "@/lib/lark/shipment-ap";
import { isApFormCurrency, type ApFormCurrency } from "@/lib/lark/ap-form";
import type {
  LarkApprovalStatus,
  Shipment,
  ShipmentLarkSubmission,
  Supplier,
} from "@/types/database";

const SUBMISSION_SELECT = `
  id,
  shipment_id,
  invoice_kind,
  supplier_id,
  lark_instance_code,
  lark_serial_number,
  lark_approval_status,
  lark_status_synced_at,
  lark_expense_category,
  submitted_amount,
  submitted_currency,
  plan_rows,
  submitted_at,
  suppliers ( name )
`;

type SubmissionRow = {
  id: string;
  shipment_id: string;
  invoice_kind: ShipmentApInvoiceKind;
  supplier_id: string | null;
  lark_instance_code: string;
  lark_serial_number: string | null;
  lark_approval_status: LarkApprovalStatus | null;
  lark_status_synced_at: string | null;
  lark_expense_category: string | null;
  submitted_amount: number | null;
  submitted_currency: string | null;
  plan_rows: ShipmentLarkSubmission["plan_rows"];
  submitted_at: string;
  suppliers: { name: string } | { name: string }[] | null;
};

function unwrapName(
  value: { name: string } | { name: string }[] | null,
): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0]?.name ?? null : value.name;
}

function mapSubmission(row: SubmissionRow): ShipmentLarkSubmission {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    invoice_kind: row.invoice_kind,
    supplier_id: row.supplier_id,
    supplier_name: unwrapName(row.suppliers),
    lark_instance_code: row.lark_instance_code,
    lark_serial_number: row.lark_serial_number,
    lark_approval_status: row.lark_approval_status,
    lark_status_synced_at: row.lark_status_synced_at,
    lark_expense_category: row.lark_expense_category,
    submitted_amount:
      row.submitted_amount == null ? null : Number(row.submitted_amount),
    submitted_currency: row.submitted_currency,
    plan_rows: row.plan_rows,
    submitted_at: row.submitted_at,
  };
}

export async function listShipmentLarkSubmissions(
  supabase: SupabaseClient,
  shipmentId?: string,
): Promise<ShipmentLarkSubmission[]> {
  let query = supabase
    .from("shipment_lark_submissions")
    .select(SUBMISSION_SELECT)
    .order("submitted_at", { ascending: false });
  if (shipmentId) query = query.eq("shipment_id", shipmentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapSubmission(row as SubmissionRow));
}

export async function insertShipmentLarkSubmission(
  supabase: SupabaseClient,
  input: {
    shipment_id: string;
    invoice_kind: ShipmentApInvoiceKind;
    supplier_id: string | null;
    lark_instance_code: string;
    lark_serial_number: string | null;
    lark_approval_status: LarkApprovalStatus | null;
    lark_status_synced_at: string;
    lark_expense_category: string | null;
    submitted_amount: number;
    submitted_currency: string;
    plan_rows: ShipmentLarkSubmission["plan_rows"];
    submitted_at: string;
  },
): Promise<void> {
  const { error } = await supabase.from("shipment_lark_submissions").insert({
    shipment_id: input.shipment_id,
    invoice_kind: input.invoice_kind,
    supplier_id: input.supplier_id,
    lark_instance_code: input.lark_instance_code,
    lark_serial_number: input.lark_serial_number,
    lark_approval_status: input.lark_approval_status,
    lark_status_synced_at: input.lark_status_synced_at,
    lark_expense_category: input.lark_expense_category,
    submitted_amount: input.submitted_amount,
    submitted_currency: input.submitted_currency,
    plan_rows: input.plan_rows,
    submitted_at: input.submitted_at,
  });
  if (error) throw error;
}

export async function updateShipmentLarkSubmission(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    lark_serial_number: string | null;
    lark_approval_status: LarkApprovalStatus | null;
    lark_status_synced_at: string;
    submitted_amount: number;
    submitted_currency: string;
    plan_rows: ShipmentLarkSubmission["plan_rows"];
  }>,
): Promise<void> {
  const { error } = await supabase
    .from("shipment_lark_submissions")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export type ShipmentApContext = {
  shipment: Shipment;
  remarks: string;
  project: string;
  taxCurrency: ApFormCurrency;
  taxAmount: number;
  poSuppliers: Supplier[];
  taxSupplierText: string;
  submissions: ShipmentLarkSubmission[];
};

export async function getShipmentApContext(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<ShipmentApContext | null> {
  const shipment = await getShipment(supabase, shipmentId);
  if (!shipment) return null;

  const poIds = [...new Set((shipment.purchase_orders ?? []).map((po) => po.id))];
  const purchaseOrders = (
    await Promise.all(poIds.map((id) => getPurchaseOrder(supabase, id)))
  ).filter((po) => po != null);

  const supplierIds = [
    ...new Set(
      purchaseOrders
        .map((po) => po.supplier_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const poSuppliers = (
    await Promise.all(supplierIds.map((id) => getSupplier(supabase, id)))
  ).filter((s): s is Supplier => !!s);

  let taxAmount = 0;
  let taxCurrency: ApFormCurrency = "IDR";
  const currencies = new Set<string>();
  for (const po of purchaseOrders) {
    const currency = (po.currency ?? "IDR").toUpperCase();
    currencies.add(currency);
    const shipped = shipment.purchase_orders?.find((item) => item.id === po.id);
    for (const item of shipped?.items ?? []) {
      const line = po.lines?.find((l) => l.id === item.po_line_id);
      taxAmount += (line?.unit_cost ?? 0) * (Number(item.quantity) || 0);
    }
  }
  if (currencies.size === 1) {
    const only = [...currencies][0];
    if (isApFormCurrency(only)) taxCurrency = only;
  } else if (purchaseOrders[0] && isApFormCurrency(purchaseOrders[0].currency ?? "")) {
    taxCurrency = purchaseOrders[0].currency as ApFormCurrency;
  }

  const remarks = formatShipmentPaymentRemarks(shipment);
  const submissions = await listShipmentLarkSubmissions(supabase, shipmentId);

  return {
    shipment,
    remarks,
    project: defaultShipmentApProject(shipment),
    taxCurrency,
    taxAmount,
    poSuppliers,
    taxSupplierText: defaultShipmentApSupplierText("tax", poSuppliers),
    submissions,
  };
}

export type ShipmentPaymentListRow = {
  shipment: Shipment;
  tax: ShipmentLarkSubmission | null;
  shipping: ShipmentLarkSubmission | null;
};

export async function listShipmentPaymentRows(
  supabase: SupabaseClient,
): Promise<ShipmentPaymentListRow[]> {
  const [shipments, submissions] = await Promise.all([
    listShipments(supabase),
    listShipmentLarkSubmissions(supabase),
  ]);
  return shipments.map((shipment) => {
    const forShipment = submissions.filter((s) => s.shipment_id === shipment.id);
    return {
      shipment,
      tax: forShipment.find((s) => s.invoice_kind === "tax") ?? null,
      shipping: forShipment.find((s) => s.invoice_kind === "shipping") ?? null,
    };
  });
}
