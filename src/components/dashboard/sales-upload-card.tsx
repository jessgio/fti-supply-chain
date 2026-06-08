"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parseSalesExcel } from "@/lib/excel/parse";
import {
  filterSalesRowsForUpload,
  SALES_UPLOAD_MONTHS,
} from "@/lib/sales/upload-window";
import type { SalesRow } from "@/types/database";

const ROW_CHUNK = 2500;

interface SalesUploadCardProps {
  title: string;
  description: string;
}

function retailPricesFromRows(rows: SalesRow[]): Record<string, number> {
  const retailBySku: Record<string, number> = {};
  for (const row of rows) {
    if (row.retail_price && row.retail_price > 0) {
      retailBySku[row.sku_code] = Math.max(
        retailBySku[row.sku_code] ?? 0,
        row.retail_price,
      );
    }
  }
  return retailBySku;
}

async function postImport(body: unknown) {
  const res = await fetch("/api/upload/sales/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? "Upload failed: invalid server response"
        : `Upload failed (${res.status}): ${text.slice(0, 200) || res.statusText}`,
    );
  }
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  return data;
}

export function SalesUploadCard({ title, description }: SalesUploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setStatus("Parsing Excel in your browser...");
    try {
      const rows = await parseSalesExcel(await file.arrayBuffer());
      const { eligible, skippedOlder, cutoff, rangeStart, rangeEnd } =
        filterSalesRowsForUpload(rows);

      if (eligible.length === 0) {
        throw new Error(
          `No sales rows on or after ${cutoff}. Upload the last ${SALES_UPLOAD_MONTHS} months only.`,
        );
      }

      setStatus(`Preparing import of ${eligible.length.toLocaleString()} rows...`);
      const init = await postImport({
        phase: "init",
        filename: file.name,
        rowCount: eligible.length,
        rangeStart,
        rangeEnd,
        skippedOlder,
        cutoff,
      });

      const batchId = String(init.batchId);

      for (let i = 0; i < eligible.length; i += ROW_CHUNK) {
        const slice = eligible.slice(i, i + ROW_CHUNK);
        setStatus(
          `Importing rows ${(i + 1).toLocaleString()}–${Math.min(
            i + slice.length,
            eligible.length,
          ).toLocaleString()} of ${eligible.length.toLocaleString()}...`,
        );
        await postImport({
          phase: "chunk",
          batchId,
          rows: slice,
        });
      }

      setStatus("Finalizing import...");
      await postImport({
        phase: "finalize",
        batchId,
        retailBySku: retailPricesFromRows(eligible),
      });

      const parts = [
        `Imported ${eligible.length.toLocaleString()} rows`,
        `(${rangeStart} to ${rangeEnd})`,
        Number(init.replacedCount) > 0
          ? `replacing ${Number(init.replacedCount).toLocaleString()} existing`
          : null,
        skippedOlder > 0
          ? `${skippedOlder.toLocaleString()} older rows skipped`
          : null,
      ].filter(Boolean);
      setStatus(`${parts.join(", ")}.`);
      setFile(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center hover:bg-stone-100">
          <Upload className="mb-2 h-6 w-6 text-stone-500" />
          <span className="text-sm font-medium text-stone-700">
            {file ? file.name : "Choose Excel file"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button disabled={!file || loading} onClick={handleUpload}>
          {loading ? "Uploading..." : "Upload"}
        </Button>
        {status && (
          <p className="text-sm text-stone-600" role="status">
            {status}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
