import type { PurchaseOrder } from "@/types/database";
import { STATUS_LABELS } from "@/lib/procurement/po-status";

export interface ProcurementExportRow {
  "PO Number": string;
  "PO Status": string;
  "Date Ordered": string;
  "Date Expected": string;
  SKU: string;
  "Qty Ordered": number;
  "Qty Received": number;
  "Unit Price": number | "";
  Currency: string;
}

export function buildProcurementExportRows(
  purchaseOrders: PurchaseOrder[],
): ProcurementExportRow[] {
  const rows: ProcurementExportRow[] = [];

  for (const po of purchaseOrders) {
    const lines = po.lines ?? [];
    if (lines.length === 0) {
      rows.push({
        "PO Number": po.po_number,
        "PO Status": STATUS_LABELS[po.status] ?? po.status,
        "Date Ordered": po.order_date ?? "",
        "Date Expected": po.expected_date ?? "",
        SKU: "",
        "Qty Ordered": 0,
        "Qty Received": 0,
        "Unit Price": "",
        Currency: po.currency,
      });
      continue;
    }

    for (const line of lines) {
      rows.push({
        "PO Number": po.po_number,
        "PO Status": STATUS_LABELS[po.status] ?? po.status,
        "Date Ordered": po.order_date ?? "",
        "Date Expected": po.expected_date ?? "",
        SKU: line.sku_code ?? "",
        "Qty Ordered": line.qty_ordered,
        "Qty Received": line.qty_received,
        "Unit Price": line.unit_cost ?? "",
        Currency: po.currency,
      });
    }
  }

  return rows;
}

export async function downloadProcurementXlsx(
  purchaseOrders: PurchaseOrder[],
  filename?: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = buildProcurementExportRows(purchaseOrders);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Procurement");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(
    workbook,
    filename ?? `procurement-export-${stamp}.xlsx`,
  );
}
