import { createRequire } from "node:module";
import type PDFDocumentType from "pdfkit";
import type { CompanySettings, PurchaseOrder, Supplier } from "@/types/database";
import { computePoInvoiceTotals, taxLabel } from "@/lib/procurement/po-totals";
import { composePoPdfNotes } from "@/lib/procurement/supplier-po-notes";
import { formatPoMoney } from "@/lib/procurement/currencies";
import { resolveVendorLineLabel } from "@/lib/procurement/vendor-line-label";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as typeof PDFDocumentType;

export interface PoPdfData {
  po: PurchaseOrder;
  supplier: Supplier | null;
  company: CompanySettings;
  logo?: Buffer | null;
  vendorProductNames?: Map<string, string>;
}

function formatCurrency(value: number, currency: string): string {
  return formatPoMoney(value, currency);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

function lineTotal(qty: number, unitCost: number | null): number {
  return (unitCost ?? 0) * qty;
}

function contactBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  name: string | null | undefined,
  address: string | null | undefined,
  picName: string | null | undefined,
  picEmail: string | null | undefined,
  picPhone: string | null | undefined,
) {
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#444444")
    .text(title, x, y, { width });
  let cursor = y + 14;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(name ?? "—", x, cursor, {
    width,
  });
  cursor = doc.y + 4;

  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  if (address) {
    doc.text(address, x, cursor, { width });
    cursor = doc.y + 2;
  }
  if (picName) {
    doc.text(`PIC: ${picName}`, x, cursor, { width });
    cursor = doc.y + 2;
  }
  if (picEmail) {
    doc.text(picEmail, x, cursor, { width });
    cursor = doc.y + 2;
  }
  if (picPhone) {
    doc.text(picPhone, x, cursor, { width });
  }
  return doc.y;
}

export function generatePoPdf(data: PoPdfData): Promise<Buffer> {
  const { po, supplier, company, logo, vendorProductNames } = data;
  const vendorNames = vendorProductNames ?? new Map<string, string>();
  const totals = computePoInvoiceTotals(po);
  const currency = po.currency ?? "IDR";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const headerTop = 50;
    const logoMaxWidth = 200;
    const logoMaxHeight = 64;
    const titleFontSize = 20;
    const headerBandHeight = logo ? logoMaxHeight : titleFontSize + 4;
    const titleY = headerTop + (headerBandHeight - titleFontSize) / 2;

    if (logo) {
      doc.image(logo, left, headerTop, {
        fit: [logoMaxWidth, logoMaxHeight],
      });
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(titleFontSize)
      .fillColor("#14532d")
      .text("PURCHASE ORDER", left, titleY, { align: "center", width: pageWidth });

    const poNumberY = headerTop + headerBandHeight + 10;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#666666")
      .text(`PO Number: ${po.po_number}`, left, poNumberY, {
        align: "right",
        width: pageWidth,
      });

    const colWidth = pageWidth / 2 - 10;
    const blockTop = poNumberY + 22;

    const leftBottom = contactBlock(
      doc,
      left,
      blockTop,
      colWidth,
      "FROM",
      company.company_name,
      company.address,
      company.pic_name,
      company.pic_email,
      company.pic_phone,
    );

    const rightBottom = contactBlock(
      doc,
      left + colWidth + 20,
      blockTop,
      colWidth,
      "TO (SUPPLIER)",
      supplier?.name ?? po.supplier_name,
      supplier?.address,
      supplier?.pic_name,
      supplier?.pic_email,
      supplier?.pic_phone,
    );

    const metaTop = Math.max(leftBottom, rightBottom) + 20;

    doc.font("Helvetica").fontSize(9).fillColor("#333333");
    const metaCol = pageWidth / 3;
    doc.text(`Order date: ${formatDate(po.order_date)}`, left, metaTop, {
      width: metaCol,
    });
    doc.text(`Due date: ${formatDate(po.expected_date)}`, left + metaCol, metaTop, {
      width: metaCol,
    });
    doc.text(`Status: ${po.status.replace("_", " ")}`, left + metaCol * 2, metaTop, {
      width: metaCol,
    });
    doc.text(`Currency: ${currency}`, left, metaTop + 14, { width: metaCol });

    // Line items table
    const tableTop = metaTop + 42;
    const colSku = pageWidth * 0.38;
    const colQty = pageWidth * 0.14;
    const colUnit = pageWidth * 0.22;
    const colTotal = pageWidth * 0.26;

    doc
      .rect(left, tableTop, pageWidth, 22)
      .fill("#f5f5f4");

    doc.fillColor("#444444").font("Helvetica-Bold").fontSize(9);
    doc.text("Product", left + 8, tableTop + 6, { width: colSku - 8 });
    doc.text("Qty", left + colSku, tableTop + 6, { width: colQty, align: "right" });
    doc.text("Unit cost", left + colSku + colQty, tableTop + 6, {
      width: colUnit,
      align: "right",
    });
    doc.text("Line total", left + colSku + colQty + colUnit, tableTop + 6, {
      width: colTotal - 8,
      align: "right",
    });

    let rowY = tableTop + 22;
    doc.font("Helvetica").fontSize(9).fillColor("#111111");

    for (const line of po.lines ?? []) {
      const total = lineTotal(line.qty_ordered, line.unit_cost);
      const productLabel = resolveVendorLineLabel(line, vendorNames);
      const showInternalSku =
        vendorNames.has(line.sku_id) && line.sku_code && line.sku_code !== productLabel;
      const rowHeight = showInternalSku ? 34 : 22;

      if (rowY + rowHeight > doc.page.height - 120) {
        doc.addPage();
        rowY = doc.page.margins.top;
      }

      doc
        .moveTo(left, rowY)
        .lineTo(left + pageWidth, rowY)
        .strokeColor("#e7e5e4")
        .lineWidth(0.5)
        .stroke();

      doc.text(productLabel, left + 8, rowY + 6, { width: colSku - 8 });
      if (showInternalSku) {
        doc
          .fontSize(8)
          .fillColor("#78716c")
          .text(line.sku_code!, left + 8, rowY + 18, { width: colSku - 8 });
        doc.fontSize(9).fillColor("#111111");
      }

      doc.text(formatNumber(line.qty_ordered), left + colSku, rowY + 6, {
        width: colQty,
        align: "right",
      });
      doc.text(
        line.unit_cost != null ? formatCurrency(line.unit_cost, currency) : "—",
        left + colSku + colQty,
        rowY + 6,
        { width: colUnit, align: "right" },
      );
      doc.text(formatCurrency(total, currency), left + colSku + colQty + colUnit, rowY + 6, {
        width: colTotal - 8,
        align: "right",
      });

      rowY += rowHeight;
    }

    doc
      .moveTo(left, rowY)
      .lineTo(left + pageWidth, rowY)
      .strokeColor("#d6d3d1")
      .lineWidth(1)
      .stroke();

    // Totals
    const totalsX = left + pageWidth * 0.55;
    const totalsWidth = pageWidth * 0.45;
    let totalsY = rowY + 16;

    function totalRow(label: string, value: string, bold = false) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#111111");
      doc.text(label, totalsX, totalsY, { width: totalsWidth * 0.55 });
      doc.text(value, totalsX + totalsWidth * 0.55, totalsY, {
        width: totalsWidth * 0.45,
        align: "right",
      });
      totalsY += 18;
    }

    totalRow("Subtotal", formatCurrency(totals.subtotal, currency));
    if (totals.discount > 0) {
      totalRow("Discount", `-${formatCurrency(totals.discount, currency)}`);
    }
    totalRow(taxLabel(totals.taxPct), formatCurrency(totals.tax, currency));
    if (totals.otherCharges > 0) {
      totalRow("Other", formatCurrency(totals.otherCharges, currency));
    }
    totalRow("Invoice total", formatCurrency(totals.invoiceTotal, currency), true);
    totalRow(
      `Down payment (${totals.downPaymentPct}%)`,
      formatCurrency(totals.downPayment, currency),
    );
    totalRow("Final payment", formatCurrency(totals.finalPayment, currency), true);

    const pdfNotes = composePoPdfNotes(po.notes, supplier);

    if (pdfNotes) {
      totalsY += 10;
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#444444")
        .text("Notes", left, totalsY, { width: pageWidth });
      totalsY += 14;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#57534e")
        .text(pdfNotes, left, totalsY, { width: pageWidth });
    }

    doc.end();
  });
}
