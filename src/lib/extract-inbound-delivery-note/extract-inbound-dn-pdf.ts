import { createRequire } from "node:module";
import type PDFDocumentType from "pdfkit";
import type {
  CompanySettings,
  ExtractInboundDeliveryNote,
  ExtractInboundDeliveryNoteLine,
  ExtractInboundDnSettings,
} from "@/types/database";
import { EXTRACT_INBOUND_DN_NOTES } from "@/lib/extract-inbound-delivery-note/constants";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as typeof PDFDocumentType;

export interface ExtractInboundDnPdfData {
  note: ExtractInboundDeliveryNote;
  lines: ExtractInboundDeliveryNoteLine[];
  company: CompanySettings;
  settings: ExtractInboundDnSettings;
  logo?: Buffer | null;
}

function formatDateLong(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatQty(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function formatKg(value: number): string {
  return `${formatQty(value)} Kg`;
}

function drawSectionBar(
  doc: PDFKit.PDFDocument,
  left: number,
  y: number,
  width: number,
  title: string,
): number {
  const barHeight = 18;
  doc.rect(left, y, width, barHeight).fill("#111111");
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#ffffff")
    .text(title, left + 8, y + 5, { width: width - 16 });
  return y + barHeight + 8;
}

function addressBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  company: string,
  pic: string | null | undefined,
  address: string | null | undefined,
  phone: string | null | undefined,
  email: string | null | undefined,
): number {
  let cursor = y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111").text("Company:", x, cursor, {
    continued: true,
    width,
  });
  doc.font("Helvetica").text(` ${company}`, { width });
  cursor = doc.y + 4;

  if (pic) {
    doc.font("Helvetica-Bold").text("PIC:", x, cursor, { continued: true, width });
    doc.font("Helvetica").text(` ${pic}`, { width });
    cursor = doc.y + 4;
  }
  if (address) {
    doc.font("Helvetica-Bold").text("Address:", x, cursor, { width });
    cursor = doc.y + 2;
    doc.font("Helvetica").text(address, x, cursor, { width });
    cursor = doc.y + 4;
  }
  if (phone) {
    doc.font("Helvetica-Bold").text("Phone:", x, cursor, { continued: true, width });
    doc.font("Helvetica").text(` ${phone}`, { width });
    cursor = doc.y + 4;
  }
  if (email) {
    doc.font("Helvetica-Bold").text("Email:", x, cursor, { continued: true, width });
    doc.font("Helvetica").text(` ${email}`, { width });
    cursor = doc.y + 4;
  }
  return cursor;
}

export function generateExtractInboundDnPdf(data: ExtractInboundDnPdfData): Promise<Buffer> {
  const { note, lines, company, settings, logo } = data;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rightColX = left + pageWidth / 2 + 8;
    const colWidth = pageWidth / 2 - 8;
    const headerTop = 40;
    const logoMaxWidth = 180;
    const logoMaxHeight = 56;

    if (logo) {
      doc.image(logo, left, headerTop, { fit: [logoMaxWidth, logoMaxHeight] });
    } else {
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#111111")
        .text(company.company_name, left, headerTop, { width: colWidth });
    }

    let companyInfoY = logo ? headerTop + logoMaxHeight + 6 : doc.y + 8;
    doc.font("Helvetica").fontSize(8).fillColor("#333333");
    if (company.address) {
      doc.text(company.address, left, companyInfoY, { width: colWidth });
      companyInfoY = doc.y + 2;
    }
    if (company.pic_phone) {
      doc.text(`Phone: ${company.pic_phone}`, left, companyInfoY, { width: colWidth });
      companyInfoY = doc.y + 2;
    }
    if (company.pic_email) {
      doc.text(company.pic_email, left, companyInfoY, { width: colWidth });
    }

    const titleY = headerTop + 4;
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#111111")
      .text("DELIVERY NOTE", rightColX, titleY, { width: colWidth, align: "right" });

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333333")
      .text(`Delivery Date: ${formatDateLong(note.delivery_date)}`, rightColX, titleY + 34, {
        width: colWidth,
        align: "right",
      })
      .text(`Penerima: ${note.recipient_name}`, rightColX, doc.y + 4, {
        width: colWidth,
        align: "right",
      });

    let cursorY = Math.max(doc.y, companyInfoY + 24) + 16;

    const fromBarY = cursorY;
    const fromBarWidth = colWidth;
    drawSectionBar(doc, left, fromBarY, fromBarWidth, "DELIVERY FROM");
    const toBarY = fromBarY;
    drawSectionBar(doc, rightColX, toBarY, colWidth, "SHIP TO");

    const blockTop = fromBarY + 26;
    const fromBottom = addressBlock(
      doc,
      left,
      blockTop,
      colWidth,
      company.company_name,
      company.pic_name,
      company.address,
      company.pic_phone,
      company.pic_email,
    );
    const toBottom = addressBlock(
      doc,
      rightColX,
      blockTop,
      colWidth,
      settings.recipient_company,
      note.recipient_name || settings.recipient_pic_name,
      settings.recipient_address,
      settings.recipient_phone,
      settings.recipient_email,
    );
    cursorY = Math.max(fromBottom, toBottom) + 12;

    const tableTop = cursorY;
    const colWidths = [78, 62, 148, 48, 52, 58];
    const headers = [
      "Nomor PO",
      "Kode Barang",
      "Deskripsi",
      "Jumlah",
      "UOM",
      "Jumlah Total",
    ];
    const rowHeight = 20;
    const headerHeight = 22;

    doc.rect(left, tableTop, pageWidth, headerHeight).fill("#111111");
    let colX = left;
    headers.forEach((header, idx) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#ffffff")
        .text(header, colX + 4, tableTop + 6, {
          width: colWidths[idx] - 8,
          align: idx >= 3 ? "right" : "left",
        });
      colX += colWidths[idx];
    });

    let rowY = tableTop + headerHeight;
    let totalQty = 0;
    let totalKg = 0;

    for (const line of lines) {
      if (rowY > doc.page.height - 200) {
        doc.addPage();
        rowY = doc.page.margins.top;
      }

      doc
        .rect(left, rowY, pageWidth, rowHeight)
        .strokeColor("#dddddd")
        .lineWidth(0.5)
        .stroke();

      const values = [
        note.po_number,
        line.item_code,
        line.extract_name,
        formatQty(line.quantity),
        formatKg(line.uom_kg),
        formatKg(line.total_kg),
      ];

      colX = left;
      values.forEach((value, idx) => {
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#111111")
          .text(value, colX + 4, rowY + 6, {
            width: colWidths[idx] - 8,
            align: idx >= 3 ? "right" : "left",
          });
        colX += colWidths[idx];
      });

      totalQty += line.quantity;
      totalKg += line.total_kg;
      rowY += rowHeight;
    }

    doc.rect(left, rowY, pageWidth, rowHeight).fill("#f5f5f5");
    colX = left;
    const totals = ["", "", "TOTAL", formatQty(totalQty), "", formatKg(totalKg)];
    totals.forEach((value, idx) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#111111")
        .text(value, colX + 4, rowY + 6, {
          width: colWidths[idx] - 8,
          align: idx >= 3 ? "right" : "left",
        });
      colX += colWidths[idx];
    });

    rowY += rowHeight + 14;
    rowY = drawSectionBar(doc, left, rowY, pageWidth, "NOTES");

    const notesBoxHeight = note.special_instruction ? 72 : 54;
    doc
      .rect(left, rowY, pageWidth, notesBoxHeight)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke();

    let noteY = rowY + 8;
    if (note.special_instruction) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#333333")
        .text("Special Instruction:", left + 8, noteY, { width: pageWidth - 16 });
      noteY = doc.y + 2;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#333333")
        .text(note.special_instruction, left + 8, noteY, { width: pageWidth - 16 });
      noteY = doc.y + 8;
    }

    EXTRACT_INBOUND_DN_NOTES.forEach((text, idx) => {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#333333")
        .text(`${idx + 1}. ${text}`, left + 8, noteY, { width: pageWidth - 16 });
      noteY = doc.y + 4;
    });

    const signatureY = Math.max(noteY + 20, doc.page.height - 120);
    doc
      .moveTo(left, signatureY)
      .lineTo(left + pageWidth, signatureY)
      .strokeColor("#111111")
      .lineWidth(0.5)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#333333")
      .text(`Delivery Date\nJakarta, ${formatDateLong(note.delivery_date)}`, left, signatureY + 10, {
        width: colWidth,
      });

    doc.text(
      `Pengirim : ${company.pic_name ?? "—"}`,
      left + colWidth,
      signatureY + 10,
      { width: colWidth, align: "center" },
    );

    doc.text(`Penerima : ${note.recipient_name}`, rightColX, signatureY + 10, {
      width: colWidth,
      align: "right",
    });

    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor("#666666")
      .text(
        "If you have any questions or concerns, please contact the vendor PIC listed above, thank you!",
        left,
        signatureY + 48,
        { width: pageWidth, align: "center" },
      );

    doc.end();
  });
}
