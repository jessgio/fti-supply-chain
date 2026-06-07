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

interface UploadCardProps {
  title: string;
  description: string;
  endpoint: string;
  accept?: string;
}

export function UploadCard({
  title,
  description,
  endpoint,
  accept = ".xlsx,.xls,.csv",
}: UploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) return;
      setLoading(true);
      setStatus("Uploading and processing — large files may take a few minutes...");
      try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: formData });
      let data: {
        error?: string;
        rowCount?: number;
        mappingCount?: number;
        bundleCount?: number;
        replacedCount?: number;
        skippedOlder?: number;
        rangeStart?: string;
        rangeEnd?: string;
      } = {};
      const text = await res.text();
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
      if (data.mappingCount != null) {
        setStatus(
          `Uploaded ${data.mappingCount} franchise mappings and ${data.bundleCount ?? 0} bundle rules.`,
        );
      } else if (data.replacedCount != null) {
        const parts = [
          `Imported ${data.rowCount ?? 0} rows`,
          data.rangeStart && data.rangeEnd
            ? `(${data.rangeStart} to ${data.rangeEnd})`
            : null,
          data.replacedCount > 0
            ? `replacing ${data.replacedCount} existing`
            : null,
          data.skippedOlder && data.skippedOlder > 0
            ? `${data.skippedOlder} older rows skipped`
            : null,
        ].filter(Boolean);
        setStatus(`${parts.join(", ")}.`);
      } else {
        setStatus(`Uploaded ${data.rowCount ?? 0} rows successfully.`);
      }
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
            accept={accept}
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
