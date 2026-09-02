"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Eye, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DocumentFilePreviewDialog } from "@/components/shipments/document-file-preview-dialog";
import {
  isPreviewableDocument,
} from "@/lib/shipments/document-preview";
import { PROFORMA_INVOICE_ACCEPT, PO_DOCUMENT_MAX_FILE_SIZE } from "@/lib/procurement/po-documents";
import { formatDate } from "@/lib/utils";
import type { PoDocument, PurchaseOrder } from "@/types/database";

function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PoProformaInvoicesSection({
  po,
  readOnly = false,
}: {
  po: PurchaseOrder;
  readOnly?: boolean;
}) {
  const [documents, setDocuments] = useState<PoDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    fileName: string;
    mimeType: string | null;
    url: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/pos/${po.id}/documents`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load documents");
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [po.id]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > PO_DOCUMENT_MAX_FILE_SIZE) {
      setError(
        `File exceeds ${Math.floor(PO_DOCUMENT_MAX_FILE_SIZE / (1024 * 1024))} MB limit.`,
      );
      e.target.value = "";
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", "proforma_invoice");
      if (notes.trim()) formData.append("notes", notes.trim());

      const res = await fetch(`/api/procurement/pos/${po.id}/documents`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      setNotes("");
      e.target.value = "";
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function fetchDocumentUrl(documentId: string) {
    const res = await fetch(
      `/api/procurement/pos/${po.id}/documents/${documentId}/download`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load file");
    return data as { url: string; file_name: string; mime_type: string | null };
  }

  async function downloadDocument(documentId: string) {
    try {
      const data = await fetchDocumentUrl(documentId);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function previewDocument(
    documentId: string,
    fileName: string,
    mimeType: string | null,
  ) {
    setPreview({
      fileName,
      mimeType,
      url: null,
      loading: true,
      error: null,
    });
    try {
      const data = await fetchDocumentUrl(documentId);
      setPreview({
        fileName: data.file_name,
        mimeType: data.mime_type ?? mimeType,
        url: data.url,
        loading: false,
        error: null,
      });
    } catch (err) {
      setPreview({
        fileName,
        mimeType,
        url: null,
        loading: false,
        error: err instanceof Error ? err.message : "Preview failed",
      });
    }
  }

  async function deleteDocument(documentId: string) {
    if (!window.confirm("Remove this proforma invoice attachment?")) return;

    setDeletingId(documentId);
    setError(null);
    try {
      const res = await fetch(
        `/api/procurement/pos/${po.id}/documents/${documentId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-4 w-4 text-stone-500" />
          Supplier proforma invoice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-stone-600">
          Attach the supplier&apos;s proforma invoice as PDF, JPG, or Excel
          (XLS/XLSX), up to {Math.floor(PO_DOCUMENT_MAX_FILE_SIZE / (1024 * 1024))}{" "}
          MB. Newer uploads are kept as additional versions.
        </p>

        {!readOnly && (
          <div className="rounded-lg border border-dashed border-stone-300 p-4">
            <label className="mb-2 block text-sm text-stone-600">
              Notes (optional)
              <Input
                className="mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Revised pricing"
                disabled={uploading}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload proforma"}
              <input
                type="file"
                className="hidden"
                accept={PROFORMA_INVOICE_ACCEPT}
                disabled={uploading}
                onChange={handleUpload}
              />
            </label>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-stone-500">Loading attachments…</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-stone-500">No proforma invoice attached yet.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-stone-800">
                      {doc.file_name}
                    </span>
                    <Badge className="bg-stone-100 text-stone-700">
                      v{doc.version_number}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {formatDate(doc.created_at)}
                    {formatFileSize(doc.file_size)
                      ? ` · ${formatFileSize(doc.file_size)}`
                      : ""}
                    {doc.notes ? ` · ${doc.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isPreviewableDocument(doc.mime_type, doc.file_name) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        previewDocument(doc.id, doc.file_name, doc.mime_type)
                      }
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadDocument(doc.id)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-700 hover:text-rose-800"
                      disabled={deletingId === doc.id}
                      onClick={() => deleteDocument(doc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === doc.id ? "Removing…" : "Remove"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <DocumentFilePreviewDialog
          open={preview !== null}
          onClose={() => setPreview(null)}
          fileName={preview?.fileName ?? ""}
          mimeType={preview?.mimeType ?? null}
          url={preview?.url ?? null}
          loading={preview?.loading ?? false}
          error={preview?.error ?? null}
        />
      </CardContent>
    </Card>
  );
}
