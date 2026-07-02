import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ShipmentDocumentSummary,
  ShipmentDocumentType,
  ShipmentDocumentVersion,
  ShipmentDocumentVersionStatus,
} from "@/types/database";
import {
  isShipmentDocumentType,
  SHIPMENT_DOCUMENT_TYPES,
} from "@/lib/shipments/document-types";

const STORAGE_BUCKET = "data-uploads";
const SIGNED_URL_TTL = 3600;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

type RequiredDocRow = { document_type: ShipmentDocumentType };
type VersionRow = {
  id: string;
  shipment_id: string;
  document_type: ShipmentDocumentType;
  version_number: number;
  status: ShipmentDocumentVersionStatus;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
};

function mapVersion(row: VersionRow): ShipmentDocumentVersion {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    document_type: row.document_type,
    version_number: row.version_number,
    status: row.status,
    file_name: row.file_name,
    mime_type: row.mime_type,
    uploaded_by: row.uploaded_by,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
}

export async function getRequiredDocuments(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<ShipmentDocumentType[]> {
  const { data, error } = await supabase
    .from("shipment_required_documents")
    .select("document_type")
    .eq("shipment_id", shipmentId)
    .order("document_type");
  if (error) throw error;
  return (data ?? []).map((row) => row.document_type as ShipmentDocumentType);
}

export async function setRequiredDocuments(
  supabase: SupabaseClient,
  shipmentId: string,
  documentTypes: ShipmentDocumentType[],
): Promise<void> {
  const unique = [...new Set(documentTypes)];
  for (const docType of unique) {
    if (!isShipmentDocumentType(docType)) {
      throw new Error(`Invalid document type: ${docType}`);
    }
  }

  const { error: deleteError } = await supabase
    .from("shipment_required_documents")
    .delete()
    .eq("shipment_id", shipmentId);
  if (deleteError) throw deleteError;

  if (unique.length === 0) return;

  const rows = unique.map((document_type) => ({
    shipment_id: shipmentId,
    document_type,
  }));
  const { error: insertError } = await supabase
    .from("shipment_required_documents")
    .insert(rows);
  if (insertError) throw insertError;
}

export async function listDocumentVersions(
  supabase: SupabaseClient,
  shipmentId: string,
  documentType?: ShipmentDocumentType,
): Promise<ShipmentDocumentVersion[]> {
  let query = supabase
    .from("shipment_document_versions")
    .select(
      "id, shipment_id, document_type, version_number, status, storage_path, file_name, mime_type, uploaded_by, notes, created_at",
    )
    .eq("shipment_id", shipmentId)
    .order("document_type")
    .order("version_number", { ascending: false });

  if (documentType) {
    query = query.eq("document_type", documentType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapVersion(row as VersionRow));
}

export async function getShipmentDocumentSummaries(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<ShipmentDocumentSummary[]> {
  const [required, versions] = await Promise.all([
    getRequiredDocuments(supabase, shipmentId),
    listDocumentVersions(supabase, shipmentId),
  ]);

  const requiredSet = new Set(required);
  const typesToShow = new Set<ShipmentDocumentType>([
    ...SHIPMENT_DOCUMENT_TYPES.filter((t) => requiredSet.has(t)),
    ...versions.map((v) => v.document_type),
  ]);

  const summaries: ShipmentDocumentSummary[] = [];

  for (const documentType of SHIPMENT_DOCUMENT_TYPES) {
    if (!typesToShow.has(documentType)) continue;

    const docVersions = versions.filter((v) => v.document_type === documentType);
    const latest = docVersions[0] ?? null;
    summaries.push({
      document_type: documentType,
      required: requiredSet.has(documentType),
      latest_version: latest,
      version_count: docVersions.length,
      has_final: docVersions.some((v) => v.status === "final"),
    });
  }

  return summaries;
}

export async function getMissingDocumentCountsByShipmentId(
  supabase: SupabaseClient,
  shipmentIds: string[],
): Promise<Map<string, number>> {
  if (shipmentIds.length === 0) return new Map();

  const { data: required, error: reqError } = await supabase
    .from("shipment_required_documents")
    .select("shipment_id, document_type")
    .in("shipment_id", shipmentIds);
  if (reqError) throw reqError;

  const { data: versions, error: verError } = await supabase
    .from("shipment_document_versions")
    .select("shipment_id, document_type")
    .in("shipment_id", shipmentIds);
  if (verError) throw verError;

  const uploadedKeys = new Set(
    (versions ?? []).map((v) => `${v.shipment_id}:${v.document_type}`),
  );

  const counts = new Map<string, number>();
  for (const id of shipmentIds) counts.set(id, 0);

  for (const row of required ?? []) {
    const shipmentId = row.shipment_id as string;
    const key = `${shipmentId}:${row.document_type}`;
    if (!uploadedKeys.has(key)) {
      counts.set(shipmentId, (counts.get(shipmentId) ?? 0) + 1);
    }
  }

  return counts;
}

async function nextVersionNumber(
  supabase: SupabaseClient,
  shipmentId: string,
  documentType: ShipmentDocumentType,
): Promise<number> {
  const { data, error } = await supabase
    .from("shipment_document_versions")
    .select("version_number")
    .eq("shipment_id", shipmentId)
    .eq("document_type", documentType)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.version_number) + 1 : 1;
}

export async function uploadShipmentDocumentVersion(
  supabase: SupabaseClient,
  shipmentId: string,
  documentType: ShipmentDocumentType,
  file: File,
  status: ShipmentDocumentVersionStatus,
  uploadedBy: string | null,
  notes?: string | null,
): Promise<ShipmentDocumentVersion> {
  if (!isShipmentDocumentType(documentType)) {
    throw new Error("Invalid document type.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File exceeds 50 MB limit.");
  }
  if (status !== "draft" && status !== "final") {
    throw new Error("Status must be draft or final.");
  }

  const versionNumber = await nextVersionNumber(
    supabase,
    shipmentId,
    documentType,
  );

  const safeName = sanitizeFileName(file.name);
  const storagePath = `shipments/${shipmentId}/${documentType}/v${versionNumber}-${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("shipment_document_versions")
    .insert({
      shipment_id: shipmentId,
      document_type: documentType,
      version_number: versionNumber,
      status,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      uploaded_by: uploadedBy,
      notes: notes?.trim() || null,
    })
    .select(
      "id, shipment_id, document_type, version_number, status, storage_path, file_name, mime_type, uploaded_by, notes, created_at",
    )
    .single();
  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw error;
  }

  return mapVersion(data as VersionRow);
}

export async function getShipmentDocumentDownloadUrl(
  supabase: SupabaseClient,
  versionId: string,
): Promise<{ url: string; file_name: string; mime_type: string | null }> {
  const { data: version, error } = await supabase
    .from("shipment_document_versions")
    .select("storage_path, file_name, mime_type")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  if (!version) throw new Error("Document version not found.");

  const { data: signed, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(version.storage_path, SIGNED_URL_TTL);
  if (signError) throw signError;
  if (!signed?.signedUrl) throw new Error("Failed to generate download URL.");

  return {
    url: signed.signedUrl,
    file_name: version.file_name,
    mime_type: version.mime_type,
  };
}

export async function updateShipmentDocumentVersionStatus(
  supabase: SupabaseClient,
  versionId: string,
  status: ShipmentDocumentVersionStatus,
): Promise<ShipmentDocumentVersion> {
  if (status !== "draft" && status !== "final") {
    throw new Error("Status must be draft or final.");
  }

  const { data, error } = await supabase
    .from("shipment_document_versions")
    .update({ status })
    .eq("id", versionId)
    .select(
      "id, shipment_id, document_type, version_number, status, storage_path, file_name, mime_type, uploaded_by, notes, created_at",
    )
    .single();
  if (error) throw error;
  if (!data) throw new Error("Document version not found.");

  return mapVersion(data as VersionRow);
}

export async function deleteShipmentDocumentVersion(
  supabase: SupabaseClient,
  versionId: string,
): Promise<void> {
  const { data: version, error: fetchError } = await supabase
    .from("shipment_document_versions")
    .select("storage_path")
    .eq("id", versionId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!version) throw new Error("Document version not found.");

  const { error: deleteError } = await supabase
    .from("shipment_document_versions")
    .delete()
    .eq("id", versionId);
  if (deleteError) throw deleteError;

  await supabase.storage.from(STORAGE_BUCKET).remove([version.storage_path]);
}

export async function deleteShipmentDocuments(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<void> {
  const { data: versionRows, error: fetchError } = await supabase
    .from("shipment_document_versions")
    .select("storage_path")
    .eq("shipment_id", shipmentId);
  if (fetchError) throw fetchError;

  await supabase
    .from("shipment_required_documents")
    .delete()
    .eq("shipment_id", shipmentId);

  await supabase
    .from("shipment_document_versions")
    .delete()
    .eq("shipment_id", shipmentId);

  const storagePaths = (versionRows ?? []).map((r) => r.storage_path as string);
  if (storagePaths.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths);
  }
}
