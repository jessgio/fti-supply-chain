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
import { createClient } from "@/lib/supabase/client";

interface SalesUploadCardProps {
  title: string;
  description: string;
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
  const [fullReprocess, setFullReprocess] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setStatus("Requesting secure upload slot...");
    try {
      const { path, token } = await postImport({
        phase: "upload-url",
        filename: file.name,
      });

      setStatus(`Uploading ${file.name} to storage...`);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("data-uploads")
        .uploadToSignedUrl(String(path), String(token), file, {
          contentType:
            file.type ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

      if (uploadError) throw uploadError;

      setStatus(
        fullReprocess
          ? "Full reprocess on server — scanning and importing all rows (may take 10–15 minutes). Keep this tab open…"
          : "Processing import on server (large files may take several minutes). Keep this tab open…",
      );
      const result = await postImport({
        phase: "process",
        storagePath: String(path),
        filename: file.name,
        fullReprocess,
      });

      const parts = [
        `Imported ${Number(result.rowCount ?? 0).toLocaleString()} rows`,
        result.rangeStart && result.rangeEnd
          ? `(${result.rangeStart} to ${result.rangeEnd})`
          : null,
        Number(result.replacedCount) > 0
          ? `replacing ${Number(result.replacedCount).toLocaleString()} existing`
          : null,
        Number(result.skippedOlder) > 0
          ? `${Number(result.skippedOlder).toLocaleString()} older rows skipped`
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
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={fullReprocess}
            onChange={(e) => setFullReprocess(e.target.checked)}
            disabled={loading}
          />
          Full reprocess — replace every sale date in the file (use after return-qty
          fixes; slower, needs complete WMS export)
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
