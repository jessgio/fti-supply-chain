import assert from "node:assert/strict";
import test from "node:test";
import {
  AP_FORM_WIDGETS,
  DEFAULT_AP_BRAND,
  DEFAULT_AP_EXPENSE_CATEGORY,
  buildApFormControls,
} from "./ap-form";
import {
  formFilesFromLarkForm,
  formatLarkAttachmentExt,
  splitLarkAttachmentNames,
  toClientLarkFormFiles,
} from "./form-files";

const PDF =
  "https://cdn.example.com/lark-approval-attachment/file/PO-1042.pdf?x-expires=1&x-signature=abc";
const PNG =
  "https://cdn.example.com/lark-approval-attachment/image/scan.png?x-expires=1\\u0026x-signature=abc";

test("quoted Lark ext names stay intact when a filename contains a comma", () => {
  assert.deepEqual(splitLarkAttachmentNames("'Invoice, March.pdf','PO-1.pdf'"), [
    "Invoice, March.pdf",
    "PO-1.pdf",
  ]);
  assert.equal(
    formatLarkAttachmentExt(["Invoice, March.pdf", "PO-1.pdf"]),
    "'Invoice, March.pdf','PO-1.pdf'",
  );
});

test("form attachments use ext names and ignore comment-like widgets", () => {
  const form = JSON.stringify([
    { id: "widget-notes", type: "textarea", value: "see file" },
    {
      id: "plan",
      type: "fieldList",
      value: [[{ id: "amount", type: "amount", value: 10 }]],
    },
    {
      id: AP_FORM_WIDGETS.attachments,
      type: "attachmentV2",
      ext: "'Invoice, March.png','PO-1042.pdf'",
      value: [PNG, PDF],
    },
  ]);

  const files = formFilesFromLarkForm(form);
  assert.equal(files.length, 2);
  assert.equal(files[0]?.title, "Invoice, March.png");
  assert.equal(files[0]?.mimeType, "image/png");
  assert.equal(files[0]?.type, "image");
  assert.match(files[0]?.url ?? "", /x-signature=abc/);
  assert.equal(files[1]?.title, "PO-1042.pdf");
  assert.equal(files[1]?.mimeType, "application/pdf");
  assert.equal(toClientLarkFormFiles(files)[1]?.title, "PO-1042.pdf");
  assert.equal("url" in (toClientLarkFormFiles(files)[0] ?? {}), false);
});

test("object attachment values and image widgets are included", () => {
  const files = formFilesFromLarkForm([
    {
      id: "photo",
      type: "image",
      ext: "booth.jpg",
      value: [
        {
          url: "https://cdn.example.com/booth.jpg",
          file_size: 4096,
          title: "booth.jpg",
          type: "image",
        },
      ],
    },
    {
      id: AP_FORM_WIDGETS.attachments,
      type: "attachmentV2",
      value: ["D93653C3-2609-4EE0-8041-61DC1D84F0B5"],
      ext: "contract.docx",
    },
  ]);

  assert.equal(files.length, 2);
  assert.equal(files[0]?.title, "booth.jpg");
  assert.equal(files[0]?.fileSize, 4096);
  assert.equal(files[0]?.mimeType, "image/jpeg");
  assert.equal(files[1]?.title, "contract.docx");
  assert.equal(files[1]?.url, null);
  assert.equal(files[1]?.fileCode, "D93653C3-2609-4EE0-8041-61DC1D84F0B5");
  assert.equal(
    files[1]?.mimeType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

test("a single unquoted filename that contains a comma is not split", () => {
  const files = formFilesFromLarkForm([
    {
      id: AP_FORM_WIDGETS.attachments,
      type: "attachmentV2",
      ext: "Invoice, March.pdf",
      value: [PDF],
    },
  ]);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.title, "Invoice, March.pdf");
});

test("unsafe attachment URLs are dropped", () => {
  const files = formFilesFromLarkForm([
    {
      id: AP_FORM_WIDGETS.attachments,
      type: "attachmentV2",
      ext: "local.pdf,ok.pdf",
      value: ["http://127.0.0.1/local.pdf", PDF],
    },
  ]);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.title, "ok.pdf");
});

test("submitted AP controls keep original attachment names in ext", () => {
  const controls = buildApFormControls({
    expenseCategory: DEFAULT_AP_EXPENSE_CATEGORY,
    brand: DEFAULT_AP_BRAND,
    planRows: [
      {
        dateYmd: "2026-01-15",
        amount: 1000,
        currency: "IDR",
        remarks: "Down payment",
      },
    ],
    attachmentCodes: ["CODE-PDF", "CODE-INV"],
    attachmentExt: formatLarkAttachmentExt(["PO-9.pdf", "Invoice, March.pdf"]),
  });
  const attachments = controls.find(
    (control) => control.id === AP_FORM_WIDGETS.attachments,
  );
  assert.ok(attachments);
  assert.deepEqual(attachments.value, ["CODE-PDF", "CODE-INV"]);
  assert.equal(attachments.ext, "'PO-9.pdf','Invoice, March.pdf'");
});
