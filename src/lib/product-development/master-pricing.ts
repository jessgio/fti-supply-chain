import type { PdFile, PdPricingLine, PdPricingLineKey } from "@/types/database";

export const PRICING_OFFER_LETTER_CATEGORY = "pricing_offer_letter";
export const PRICING_STATEMENT_LETTER_CATEGORY = "pricing_statement_letter";

export const PRICING_LINE_DEFS: {
  key: PdPricingLineKey;
  label: string;
  sort_order: number;
}[] = [
  { key: "cogm", label: "COGM", sort_order: 0 },
  { key: "primary", label: "Primary", sort_order: 1 },
  { key: "secondary", label: "Secondary", sort_order: 2 },
  { key: "extract", label: "Extract", sort_order: 3 },
  { key: "lartas", label: "Lartas", sort_order: 4 },
];

export const PRICING_COST_LINE_KEYS: PdPricingLineKey[] = PRICING_LINE_DEFS.map(
  (d) => d.key,
);

export interface PdPricingSummary {
  totalCogs: number | null;
  multiplierAsp: number | null;
  multiplierRsp: number | null;
}

export function pricingLineAmount(
  lines: PdPricingLine[],
  key: PdPricingLineKey,
): number | null {
  const line = lines.find(
    (l) =>
      l.line_key === key ||
      (key === "cogm" && (l.line_key as string) === "cogm_moq_5k"),
  );
  if (line?.amount == null) return null;
  return Number(line.amount);
}

export function computePricingSummary(
  lines: PdPricingLine[],
  rsp: number | null | undefined,
  asp: number | null | undefined,
): PdPricingSummary {
  const parts = PRICING_COST_LINE_KEYS.map((key) => pricingLineAmount(lines, key));
  const hasAny = parts.some((v) => v != null);
  if (!hasAny) {
    return { totalCogs: null, multiplierAsp: null, multiplierRsp: null };
  }

  const totalCogs = parts.reduce<number>(
    (sum, v) => sum + (v ?? 0),
    0,
  );
  const multiplierAsp =
    asp != null && totalCogs > 0 ? asp / totalCogs : null;
  const multiplierRsp =
    rsp != null && totalCogs > 0 ? rsp / totalCogs : null;

  return { totalCogs, multiplierAsp, multiplierRsp };
}

export function pricingLineFiles(
  files: PdFile[],
  lineId: string,
): { offerLetter: PdFile | null; statementLetter: PdFile | null } {
  const lineFiles = files.filter((f) => f.pricing_line_id === lineId);
  return {
    offerLetter:
      lineFiles.find((f) => f.file_category === PRICING_OFFER_LETTER_CATEGORY) ??
      null,
    statementLetter:
      lineFiles.find(
        (f) => f.file_category === PRICING_STATEMENT_LETTER_CATEGORY,
      ) ?? null,
  };
}

export function enrichPricingLines(
  lines: PdPricingLine[],
  files: PdFile[],
  suppliersById: Map<
    string,
    { name: string; pic_name: string | null; pic_phone: string | null }
  >,
): PdPricingLine[] {
  return lines.map((line) => {
    const supplier = line.supplier_id
      ? suppliersById.get(line.supplier_id)
      : null;
    const { offerLetter, statementLetter } = pricingLineFiles(files, line.id);
    return {
      ...line,
      supplier_name: supplier?.name ?? null,
      supplier_pic_name: supplier?.pic_name ?? null,
      supplier_pic_phone: supplier?.pic_phone ?? null,
      offer_letter: offerLetter,
      statement_letter: statementLetter,
    };
  });
}
