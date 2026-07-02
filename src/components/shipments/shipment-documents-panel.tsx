"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Eye, FileText, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DocumentFilePreviewDialog } from "@/components/shipments/document-file-preview-dialog";
import { ShipmentDocumentChecklist } from "@/components/shipments/shipment-document-checklist";
import {
  SHIPMENT_DOCUMENT_LABELS,
  SHIPMENT_DOCUMENT_VERSION_STATUS_LABELS,
  SHIPMENT_DOCUMENT_VERSION_STATUS_STYLES,
  type ShipmentDocumentType,
  type ShipmentDocumentVersionStatus,
} from "@/lib/shipments/document-types";
import {
  getDocumentPreviewKind,
  isPreviewableDocument,
} from "@/lib/shipments/document-preview";
import type {
  Shipment,
  ShipmentDocumentSummary,
  ShipmentDocumentVersion,
} from "@/types/database";

interface ShipmentDocumentsPanelProps {
  shipment: Shipment;
  readOnly?: boolean;
}

export function ShipmentDocumentsPanel({
  shipment,
  readOnly = false,
}: ShipmentDocumentsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiredDocs, setRequiredDocs] = useState<ShipmentDocumentType[]>([]);
  const [summaries, setSummaries] = useState<ShipmentDocumentSummary[]>([]);
  const [uploadType, setUploadType] = useState<ShipmentDocumentType | "">("");
  const [uploadStatus, setUploadStatus] =
    useState<ShipmentDocumentVersionStatus>("draft");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
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
      const res = await fetch(`/api/shipments/${shipment.id}/documents`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load documents");
      setRequiredDocs(data.required_documents ?? []);
      setSummaries(data.summaries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [shipment.id]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (requiredDocs.length > 0 && !uploadType) {
      setUploadType(requiredDocs[0]);
    }
  }, [requiredDocs, uploadType]);

  async function saveRequiredDocs() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/documents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ required_documents: requiredDocs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save checklist");
      setSummaries(data.summaries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!uploadType) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("status", uploadStatus);
      if (uploadNotes.trim()) formData.append("notes", uploadNotes.trim());

      const res = await fetch(
        `/api/shipments/${shipment.id}/documents/${uploadType}/upload`,
        { method: "POST", body: formData },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      setUploadNotes("");
      e.target.value = "";
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function fetchVersionUrl(versionId: string) {
    const res = await fetch(
      `/api/shipments/${shipment.id}/documents/versions/${versionId}/download`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load file");
    return data as { url: string; file_name: string; mime_type: string | null };
  }

  async function downloadVersion(versionId: string) {
    try {
      const data = await fetchVersionUrl(versionId);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function previewVersion(
    versionId: string,
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
      const data = await fetchVersionUrl(versionId);
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

  async function updateVersionStatus(
    versionId: string,
    status: ShipmentDocumentVersionStatus,
  ) {
    setError(null);
    try {
      const res = await fetch(
        `/api/shipments/${shipment.id}/documents/versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update status");
      setSummaries(data.summaries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  const activeSummaries = summaries.filter((s) => s.required || s.version_count > 0);

  if (loading) {
    return <p className="py-8 text-center text-sm text-stone-500">Loading documents…</p>;
  }

  return (
    <div className="space-y-6">
      {!readOnly && (
        <div className="rounded-lg border border-stone-200 p-4">
          <ShipmentDocumentChecklist
            shipmentType={shipment.shipment_type}
            selected={requiredDocs}
            onChange={setRequiredDocs}
            resetOnTypeChange={false}
          />
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={saveRequiredDocs} disabled={saving}>
              {saving ? "Saving…" : "Save checklist"}
            </Button>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="mb-3 text-sm font-medium text-stone-700">Upload document</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Document type</span>
              <Select
                value={uploadType}
                onChange={(e) =>
                  setUploadType(e.target.value as ShipmentDocumentType)
                }
              >
                <option value="" disabled>
                  Select type
                </option>
                {requiredDocs.map((docType) => (
                  <option key={docType} value={docType}>
                    {SHIPMENT_DOCUMENT_LABELS[docType]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600">Version status</span>
              <Select
                value={uploadStatus}
                onChange={(e) =>
                  setUploadStatus(e.target.value as ShipmentDocumentVersionStatus)
                }
              >
                <option value="draft">Draft</option>
                <option value="final">Final</option>
              </Select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-stone-600">Notes (optional)</span>
              <Input
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Revision notes"
              />
            </label>
          </div>
          <div className="mt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-600 hover:bg-stone-50">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Choose file to upload"}
              <input
                type="file"
                className="hidden"
                disabled={uploading || !uploadType}
                onChange={handleUpload}
              />
            </label>
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-sm font-medium text-stone-700">Document status</p>
        {activeSummaries.length === 0 ? (
          <p className="text-sm text-stone-500">
            {readOnly
              ? "No documents on file."
              : "No documents required yet. Save a checklist above."}
          </p>
        ) : (
          <div className="space-y-3">
            {activeSummaries.map((summary) => (
              <DocumentSummaryRow
                key={summary.document_type}
                summary={summary}
                shipmentId={shipment.id}
                readOnly={readOnly}
                onDownload={downloadVersion}
                onPreview={previewVersion}
                onStatusChange={updateVersionStatus}
              />
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}

function DocumentSummaryRow({
  summary,
  shipmentId,
  readOnly,
  onDownload,
  onPreview,
  onStatusChange,
}: {
  summary: ShipmentDocumentSummary;
  shipmentId: string;
  readOnly: boolean;
  onDownload: (versionId: string) => void;
  onPreview: (
    versionId: string,
    fileName: string,
    mimeType: string | null,
  ) => void;
  onStatusChange: (
    versionId: string,
    status: ShipmentDocumentVersionStatus,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState<ShipmentDocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [updatingVersionId, setUpdatingVersionId] = useState<string | null>(null);
  const [latestPreviewUrl, setLatestPreviewUrl] = useState<string | null>(null);
  const [loadingLatestPreview, setLoadingLatestPreview] = useState(false);

  async function toggleVersions() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setLoadingVersions(true);
    try {
      const res = await fetch(
        `/api/shipments/${shipmentId}/documents/${summary.document_type}/versions`,
      );
      const data = await res.json();
      if (res.ok) {
        setVersions(data.versions ?? []);
        setExpanded(true);
      }
    } finally {
      setLoadingVersions(false);
    }
  }

  async function handleStatusChange(
    versionId: string,
    status: ShipmentDocumentVersionStatus,
  ) {
    setUpdatingVersionId(versionId);
    try {
      await onStatusChange(versionId, status);
      setVersions((prev) =>
        prev.map((v) => (v.id === versionId ? { ...v, status } : v)),
      );
    } finally {
      setUpdatingVersionId(null);
    }
  }

  const latest = summary.latest_version;
  const latestPreviewKind = latest
    ? getDocumentPreviewKind(latest.mime_type, latest.file_name)
    : null;

  useEffect(() => {
    if (!latest || latestPreviewKind !== "image") {
      setLatestPreviewUrl(null);
      return;
    }

    let cancelled = false;
    setLoadingLatestPreview(true);
    fetch(`/api/shipments/${shipmentId}/documents/versions/${latest.id}/download`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.url) setLatestPreviewUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setLatestPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingLatestPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [latest, latestPreviewKind, shipmentId]);

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-stone-400" />
          <span className="text-sm font-medium text-stone-800">
            {SHIPMENT_DOCUMENT_LABELS[summary.document_type]}
          </span>
          {summary.required && (
            <Badge className="bg-sky-100 text-sky-800">Required</Badge>
          )}
          {summary.has_final ? (
            <Badge className="bg-emerald-100 text-emerald-800">Final on file</Badge>
          ) : summary.version_count > 0 ? (
            <Badge className="bg-amber-100 text-amber-800">Draft only</Badge>
          ) : (
            <Badge className="bg-stone-100 text-stone-600">Missing</Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleVersions}
          disabled={loadingVersions || summary.version_count === 0}
        >
          {loadingVersions
            ? "Loading…"
            : expanded
              ? "Hide versions"
              : `${summary.version_count} version${summary.version_count === 1 ? "" : "s"}`}
        </Button>
      </div>

      {latest && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-stone-500">
            Latest: v{latest.version_number}{" "}
            <Badge className={SHIPMENT_DOCUMENT_VERSION_STATUS_STYLES[latest.status]}>
              {SHIPMENT_DOCUMENT_VERSION_STATUS_LABELS[latest.status]}
            </Badge>{" "}
            · {latest.file_name}
          </p>
          {latestPreviewKind === "image" && (
            <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
              {loadingLatestPreview ? (
                <p className="px-3 py-8 text-center text-xs text-stone-500">
                  Loading snapshot…
                </p>
              ) : latestPreviewUrl ? (
                <button
                  type="button"
                  className="block w-full"
                  onClick={() =>
                    onPreview(latest.id, latest.file_name, latest.mime_type)
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={latestPreviewUrl}
                    alt={latest.file_name}
                    className="max-h-48 w-full object-contain"
                  />
                </button>
              ) : null}
            </div>
          )}
          {latestPreviewKind === "pdf" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onPreview(latest.id, latest.file_name, latest.mime_type)
              }
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Preview latest PDF
            </Button>
          )}
        </div>
      )}

      {expanded && versions.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-stone-200 pt-3">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="text-stone-700">
                v{version.version_number} · {version.file_name}
                <Badge
                  className={`ml-2 ${SHIPMENT_DOCUMENT_VERSION_STATUS_STYLES[version.status]}`}
                >
                  {SHIPMENT_DOCUMENT_VERSION_STATUS_LABELS[version.status]}
                </Badge>
              </span>
              <div className="flex items-center gap-2">
                {!readOnly && (
                  <Select
                    className="h-8 w-28 text-xs"
                    value={version.status}
                    disabled={updatingVersionId === version.id}
                    onChange={(e) =>
                      handleStatusChange(
                        version.id,
                        e.target.value as ShipmentDocumentVersionStatus,
                      )
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="final">Final</option>
                  </Select>
                )}
                {isPreviewableDocument(version.mime_type, version.file_name) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onPreview(version.id, version.file_name, version.mime_type)
                    }
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDownload(version.id)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
