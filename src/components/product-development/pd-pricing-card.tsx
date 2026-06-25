"use client";

import { useMemo } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PdMasterFileField } from "@/components/product-development/pd-master-file-field";
import {
  PRICING_LINE_DEFS,
  PRICING_OFFER_LETTER_CATEGORY,
  PRICING_STATEMENT_LETTER_CATEGORY,
  computePricingSummary,
} from "@/lib/product-development/master-pricing";
import { formatNumber } from "@/lib/utils";
import type { PdPricingLineKey, PdProjectDetail, Supplier } from "@/types/database";

interface PdPricingCardProps {
  project: PdProjectDetail;
  suppliers?: Supplier[];
  editable?: boolean;
  savingLineId?: string | null;
  uploadingPricingKey?: string | null;
  onUpdateLine?: (
    lineId: string,
    patch: {
      amount?: number | null;
      moq?: string | null;
      supplier_id?: string | null;
      offer_note?: string | null;
    },
  ) => void | Promise<void>;
  onUpdateHeader?: (patch: {
    retail_price?: number | null;
    asp?: number | null;
    pricing_rmb_rate?: number | null;
    pricing_usd_rate?: number | null;
    pricing_note?: string | null;
  }) => void | Promise<void>;
  onUploadPricingFile?: (
    lineId: string,
    category: string,
    file: File,
  ) => void | Promise<void>;
  onDeletePricingFile?: (fileId: string) => void | Promise<void>;
  /** Omit outer card wrapper when nested inside the edit form. */
  embedded?: boolean;
}

const TH =
  "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone-500";
const TD = "px-3 py-2.5 align-top text-sm text-stone-800";

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="rounded-t-md bg-emerald-100 px-4 py-2.5">
      <h3 className="text-sm font-semibold text-emerald-900">{title}</h3>
    </div>
  );
}

function formatAmount(value: number | null | undefined, decimals = 0): string {
  if (value == null) return "—";
  return formatNumber(value, decimals);
}

function displayText(
  value: string | null | undefined,
  editable: boolean,
): string {
  if (value?.trim()) return value;
  return editable ? "" : "—";
}

function FileLink({ label, href }: { label: string; href?: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-sm text-emerald-700 hover:underline"
      title={label}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export function PdPricingCard({
  project,
  suppliers = [],
  editable = false,
  savingLineId = null,
  uploadingPricingKey = null,
  onUpdateLine,
  onUpdateHeader,
  onUploadPricingFile,
  onDeletePricingFile,
  embedded = false,
}: PdPricingCardProps) {
  const lines = project.pricing_lines ?? [];

  const summary = useMemo(
    () => computePricingSummary(lines, project.retail_price, project.asp),
    [lines, project.retail_price, project.asp],
  );

  const applicators = project.packaging_items.filter((item) =>
    (item.part_type ?? "").toLowerCase().includes("applicator"),
  );

  function lineFor(key: PdPricingLineKey) {
    if (key === "cogm") {
      return lines.find(
        (row) =>
          row.line_key === "cogm" ||
          (row.line_key as string) === "cogm_moq_5k",
      );
    }
    return lines.find((row) => row.line_key === key);
  }

  function renderAmountInput(
    lineId: string,
    key: PdPricingLineKey,
    amount: number | null,
  ) {
    if (!editable || !onUpdateLine) {
      const decimals = key === "extract" ? 1 : 0;
      return (
        <span className="tabular-nums">{formatAmount(amount, decimals)}</span>
      );
    }

    return (
      <Input
        key={`${lineId}-amount-${amount ?? ""}`}
        type="number"
        step={key === "extract" ? "0.1" : "1"}
        placeholder="0"
        defaultValue={amount ?? ""}
        disabled={savingLineId === lineId}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const next = raw === "" ? null : Number(raw);
          if (next !== amount && (next == null || Number.isFinite(next))) {
            void onUpdateLine(lineId, { amount: next });
          }
        }}
        className="h-8 w-full max-w-[7rem] text-sm tabular-nums"
      />
    );
  }

  function renderBreakdownCell(def: (typeof PRICING_LINE_DEFS)[number], lineId: string) {
    const line = lineFor(def.key);
    if (!line) return def.label;

    if (def.key === "cogm") {
      return (
        <div className="space-y-2">
          <span className="font-medium text-stone-900">{def.label}</span>
          {editable && onUpdateLine ? (
            <div>
              <label className="mb-1 block text-xs text-stone-500">MOQ</label>
              <Input
                key={`${lineId}-moq-${line.moq ?? ""}`}
                placeholder="e.g. 5k"
                defaultValue={line.moq ?? ""}
                disabled={savingLineId === lineId}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== (line.moq ?? null)) {
                    void onUpdateLine(lineId, { moq: next });
                  }
                }}
                className="h-8 max-w-[7rem] text-sm"
              />
            </div>
          ) : line.moq ? (
            <p className="text-xs text-stone-500">
              MOQ: <span className="text-stone-700">{line.moq}</span>
            </p>
          ) : null}
        </div>
      );
    }

    return <span className="font-medium text-stone-900">{def.label}</span>;
  }

  function renderSupplierCell(lineId: string, key: PdPricingLineKey) {
    const line = lineFor(key);
    if (!line) return null;

    if (!editable || !onUpdateLine) {
      return (
        <span>{displayText(line.supplier_name, false)}</span>
      );
    }

    return (
      <Select
        value={line.supplier_id ?? ""}
        disabled={savingLineId === lineId}
        onChange={(e) => {
          const next = e.target.value || null;
          if (next !== (line.supplier_id ?? null)) {
            void onUpdateLine(lineId, { supplier_id: next });
          }
        }}
        className="h-8 w-full min-w-[10rem] text-sm"
      >
        <option value="">Select supplier</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </Select>
    );
  }

  function renderOfferCell(lineId: string, key: PdPricingLineKey) {
    const line = lineFor(key);
    if (!line) return null;

    const uploadKey = `${lineId}:${PRICING_OFFER_LETTER_CATEGORY}`;

    if (editable && onUploadPricingFile) {
      return (
        <div className="space-y-2">
          <PdMasterFileField
            label=""
            file={line.offer_letter ?? null}
            editable
            compact
            uploading={uploadingPricingKey === uploadKey}
            onUpload={(file) =>
              void onUploadPricingFile(lineId, PRICING_OFFER_LETTER_CATEGORY, file)
            }
            onDelete={
              line.offer_letter && onDeletePricingFile
                ? () => void onDeletePricingFile(line.offer_letter!.id)
                : undefined
            }
          />
          {onUpdateLine && (
            <Input
              key={`${lineId}-offer-note-${line.offer_note ?? ""}`}
              placeholder="Note (e.g. include with COGM)"
              defaultValue={line.offer_note ?? ""}
              disabled={savingLineId === lineId}
              onBlur={(e) => {
                const next = e.target.value.trim() || null;
                if (next !== (line.offer_note ?? null)) {
                  void onUpdateLine(lineId, { offer_note: next });
                }
              }}
              className="h-8 text-xs"
            />
          )}
        </div>
      );
    }

    if (line.offer_letter?.download_url) {
      return (
        <FileLink
          label={line.offer_letter.file_name}
          href={line.offer_letter.download_url}
        />
      );
    }
    if (line.offer_note) {
      return <span className="text-stone-600">{line.offer_note}</span>;
    }
    return <span className="text-stone-400">—</span>;
  }

  function renderStatementCell(lineId: string, key: PdPricingLineKey) {
    const line = lineFor(key);
    if (!line) return null;

    const uploadKey = `${lineId}:${PRICING_STATEMENT_LETTER_CATEGORY}`;

    if (editable && onUploadPricingFile) {
      return (
        <PdMasterFileField
          label=""
          file={line.statement_letter ?? null}
          editable
          compact
          uploading={uploadingPricingKey === uploadKey}
          onUpload={(file) =>
            void onUploadPricingFile(
              lineId,
              PRICING_STATEMENT_LETTER_CATEGORY,
              file,
            )
          }
          onDelete={
            line.statement_letter && onDeletePricingFile
              ? () => void onDeletePricingFile(line.statement_letter!.id)
              : undefined
          }
        />
      );
    }

    if (line.statement_letter?.download_url) {
      return (
        <FileLink
          label={line.statement_letter.file_name}
          href={line.statement_letter.download_url}
        />
      );
    }
    return <span className="text-stone-400">N/A</span>;
  }

  const costRows = PRICING_LINE_DEFS.map((def) => ({
    def,
    line: lineFor(def.key),
  }));

  const body = (
    <>
      {!embedded && <SectionHeader title="Price Information" />}
      <div className={embedded ? "space-y-5" : "space-y-5 p-4"}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5">
            <p className="text-xs font-medium uppercase text-stone-500">RSP</p>
            {editable && onUpdateHeader ? (
              <Input
                key={`rsp-${project.retail_price ?? ""}`}
                type="number"
                placeholder="0"
                defaultValue={project.retail_price ?? ""}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw === "" ? null : Number(raw);
                  if (
                    next !== project.retail_price &&
                    (next == null || Number.isFinite(next))
                  ) {
                    void onUpdateHeader({ retail_price: next });
                  }
                }}
                className="mt-1 h-8 bg-white text-sm tabular-nums"
              />
            ) : (
              <p className="mt-1 text-base font-semibold tabular-nums text-stone-900">
                {formatAmount(project.retail_price)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5">
            <p className="text-xs font-medium uppercase text-stone-500">ASP</p>
            {editable && onUpdateHeader ? (
              <Input
                key={`asp-${project.asp ?? ""}`}
                type="number"
                placeholder="0"
                defaultValue={project.asp ?? ""}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw === "" ? null : Number(raw);
                  if (
                    next !== project.asp &&
                    (next == null || Number.isFinite(next))
                  ) {
                    void onUpdateHeader({ asp: next });
                  }
                }}
                className="mt-1 h-8 bg-white text-sm tabular-nums"
              />
            ) : (
              <p className="mt-1 text-base font-semibold tabular-nums text-stone-900">
                {formatAmount(project.asp)}
              </p>
            )}
          </div>
          {applicators.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5"
            >
              <p className="text-xs font-medium uppercase text-stone-500">
                {item.part_type ?? "Applicator"}
              </p>
              <p className="mt-1 text-sm text-stone-800">{item.part_name}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className={`${TH} w-[11rem]`}>Price breakdown</th>
                <th className={`${TH} w-[8rem]`}>Amount</th>
                <th className={`${TH} min-w-[11rem]`}>Supplier</th>
                <th className={`${TH} w-[8rem]`}>Supplier PIC</th>
                <th className={`${TH} w-[9rem]`}>Contact no.</th>
                <th className={`${TH} min-w-[11rem]`}>Price offer</th>
                <th className={`${TH} min-w-[9rem]`}>Statement letter</th>
              </tr>
            </thead>
            <tbody>
              {costRows.map(({ def, line }) => {
                if (!line) return null;
                return (
                  <tr key={def.key} className="border-b border-stone-100">
                    <td className={TD}>
                      {renderBreakdownCell(def, line.id)}
                    </td>
                    <td className={TD}>
                      {renderAmountInput(line.id, def.key, line.amount)}
                    </td>
                    <td className={TD}>{renderSupplierCell(line.id, def.key)}</td>
                    <td className={TD}>
                      {displayText(line.supplier_pic_name, editable)}
                    </td>
                    <td className={`${TD} tabular-nums`}>
                      {displayText(line.supplier_pic_phone, editable)}
                    </td>
                    <td className={TD}>{renderOfferCell(line.id, def.key)}</td>
                    <td className={TD}>{renderStatementCell(line.id, def.key)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50/80">
                <td className={`${TD} font-semibold`}>TOTAL COGS</td>
                <td className={`${TD} font-semibold tabular-nums`}>
                  {formatAmount(summary.totalCogs)}
                </td>
                <td colSpan={5} />
              </tr>
              <tr className="border-t border-stone-100 bg-white">
                <td className={TD}>Multiplier / ASP</td>
                <td className={`${TD} tabular-nums`}>
                  {summary.multiplierAsp != null
                    ? formatNumber(summary.multiplierAsp, 2)
                    : "—"}
                </td>
                <td colSpan={5} />
              </tr>
              <tr className="border-t border-stone-100 bg-white">
                <td className={TD}>Multiplier / RSP</td>
                <td className={`${TD} tabular-nums`}>
                  {summary.multiplierRsp != null
                    ? formatNumber(summary.multiplierRsp, 2)
                    : "—"}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium uppercase text-stone-500">
              RMB rate
            </label>
            {editable && onUpdateHeader ? (
              <Input
                key={`rmb-${project.pricing_rmb_rate ?? ""}`}
                type="number"
                placeholder="0"
                defaultValue={project.pricing_rmb_rate ?? ""}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw === "" ? null : Number(raw);
                  if (
                    next !== project.pricing_rmb_rate &&
                    (next == null || Number.isFinite(next))
                  ) {
                    void onUpdateHeader({ pricing_rmb_rate: next });
                  }
                }}
                className="mt-1.5 h-8 text-sm tabular-nums"
              />
            ) : (
              <p className="mt-1.5 tabular-nums">
                {formatAmount(project.pricing_rmb_rate)}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-stone-500">
              USD rate
            </label>
            {editable && onUpdateHeader ? (
              <Input
                key={`usd-${project.pricing_usd_rate ?? ""}`}
                type="number"
                placeholder="0"
                defaultValue={project.pricing_usd_rate ?? ""}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw === "" ? null : Number(raw);
                  if (
                    next !== project.pricing_usd_rate &&
                    (next == null || Number.isFinite(next))
                  ) {
                    void onUpdateHeader({ pricing_usd_rate: next });
                  }
                }}
                className="mt-1.5 h-8 text-sm tabular-nums"
              />
            ) : (
              <p className="mt-1.5 tabular-nums">
                {formatAmount(project.pricing_usd_rate)}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-stone-500">
              Note
            </label>
            {editable && onUpdateHeader ? (
              <Input
                key={`note-${project.pricing_note ?? ""}`}
                placeholder="Optional note"
                defaultValue={project.pricing_note ?? ""}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== (project.pricing_note ?? null)) {
                    void onUpdateHeader({ pricing_note: next });
                  }
                }}
                className="mt-1.5 h-8 text-sm"
              />
            ) : (
              <p className="mt-1.5 text-stone-700">
                {project.pricing_note ?? "—"}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <Card className="overflow-hidden border-stone-200">
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}
