import { z } from "zod";

/** MM/DD/YYYY -> YYYY-MM-DD; returns "" when it cannot be parsed confidently. */
export function normalizeExtractDate(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (!m) return "";
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const rowSchema = z.object({
  txn_date: z
    .string()
    .describe("The Date column value in MM/DD/YYYY format, exactly as shown."),
  order_no: z.string().nullable().describe("The 'Order No.' column text, or null."),
  tran_code: z
    .string()
    .nullable()
    .describe("The TRAN code (the short alphanumeric code such as 8L, IX, 32, 3L)."),
  from_to: z
    .string()
    .nullable()
    .describe(
      "The FROM/TO column text exactly as shown (e.g. QAC, RNI, 'SC/HC Mixing', 'PT Inovasi Alam Nus...', 'Logistic (MS)', 'WH. RM. Not Match', SCM).",
    ),
  lot_no: z.string().nullable().describe("The LOT-NO column text, or null."),
  entered_qty: z
    .number()
    .nullable()
    .describe("The 'Entered Qty' value as a number, or null if blank."),
  received: z
    .number()
    .describe("The 'Received' (inbound) value as a number. Use 0 when blank."),
  issued: z
    .number()
    .describe("The 'Issued' (outbound) value as a number. Use 0 when blank."),
  balance: z
    .number()
    .nullable()
    .describe("The running 'Balance' value after this row, as a number."),
  status: z.string().nullable().describe("The Status column text, or null."),
  remark: z.string().nullable().describe("The REMARK column text, or null."),
});

const extractSchema = z.object({
  item_no: z
    .string()
    .describe("The extract Item No shown at the top-left (e.g. 6045758)."),
  description: z
    .string()
    .nullable()
    .describe("The item description next to the Item No, or null."),
  unit: z
    .string()
    .nullable()
    .describe("The unit of measure (usually 'kg'). Default to 'kg' if unsure."),
  rows: z.array(rowSchema),
});

export type RawParsedExtract = z.infer<typeof extractSchema>;

const PROMPT = `You are extracting a raw-material extract usage ledger from a screenshot of a manufacturer's inventory system.

The screenshot has a header with the extract "Item No" (top-left) and a description, plus a unit (usually kg).

Below is a transaction table. For EVERY data row, read these columns precisely:
- Date (format MM/DD/YYYY)
- Order No.
- TRAN code (short alphanumeric code)
- FROM/TO (the category text — copy it verbatim, including punctuation and truncation like "...")
- LOT-NO
- Entered Qty
- Received (inbound; left this 0 if blank)
- Issued (outbound; leave this 0 if blank)
- Balance (the running balance after the row)
- Status
- REMARK

Rules:
- Numbers may have 5 decimal places. Read every digit carefully. Do NOT round.
- The running Balance must satisfy: previous Balance + Received - Issued = current Balance. Use this relationship to self-correct any misread digit.
- A value that is blank/empty should be 0 for Received/Issued and null for other optional fields.
- Return the rows in the exact top-to-bottom order they appear.
- Do not invent rows. Do not merge rows.`;

export interface ScreenshotImage {
  data: Uint8Array;
  mimeType: string;
}

/** Run the vision model over one screenshot and return the raw parsed table. */
export async function parseExtractScreenshot(
  image: ScreenshotImage,
): Promise<RawParsedExtract> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Add it to enable screenshot parsing.",
    );
  }

  const { generateObject } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: extractSchema,
    maxRetries: 2,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image", image: image.data, mimeType: image.mimeType },
        ],
      },
    ],
  });

  return object;
}
