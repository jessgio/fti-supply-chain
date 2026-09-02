import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoDocument, PoDocumentType } from "@/types/database";
import {
  isAllowedPoDocumentFile,
  isPoDocumentType,
  PO_DOCUMENT_MAX_FILE_SIZE,
} from "@/lib/procurement/po-documents";

const STORAGE_BUCKET = "data-uploads";
const SIGNED_URL_TTL = 3600;

type DocumentRow = {
  id: string;
  purchase_order_id: string;
  document_type: PoDocumentType;
  version_number: number;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
};

function mapDocument(row: DocumentRow): PoDocument {
  return {
    id: row.id,
    purchase_order_id: row.purchase_order_id,
    document_type: row.document_type,
    version_number: row.version_number,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    uploaded_by: row.uploaded_by,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
}

async function nextVersionNumber(
  supabase: SupabaseClient,
  purchaseOrderId: string,
  documentType: PoDocumentType,
): Promise<number> {
  const { data, error } = await supabase
    .from("purchase_order_documents")
    .select("version_number")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("document_type", documentType)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.version_number) + 1 : 1;
}

export async function listPoDocuments(
  supabase: SupabaseClient,
  purchaseOrderId: string,
  documentType?: PoDocumentType,
): Promise<PoDocument[]> {
  let query = supabase
    .from("purchase_order_documents")
    .select(
      "id, purchase_order_id, document_type, version_number, storage_path, file_name, mime_type, file_size, uploaded_by, notes, created_at",
    )
    .eq("purchase_order_id", purchaseOrderId)
    .order("document_type")
    .order("version_number", { ascending: false });

  if (documentType) {
    query = query.eq("document_type", documentType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapDocument(row as DocumentRow));
}

export async function uploadPoDocument(
  supabase: SupabaseClient,
  purchaseOrderId: string,
  documentType: PoDocumentType,
  file: File,
  uploadedBy: string | null,
  notes?: string | null,
): Promise<PoDocument> {
  if (!isPoDocumentType(documentType)) {
    throw new Error("Invalid document type.");
  }
  if (file.size > PO_DOCUMENT_MAX_FILE_SIZE) {
    throw new Error(
      `File exceeds ${Math.floor(PO_DOCUMENT_MAX_FILE_SIZE / (1024 * 1024))} MB limit.`,
    );
  }
  if (!isAllowedPoDocumentFile(file.name, file.type)) {
    throw new Error(
      "Only PDF, JPG, XLS, and XLSX files are allowed for proforma invoices.",
    );
  }

  const versionNumber = await nextVersionNumber(
    supabase,
    purchaseOrderId,
    documentType,
  );

  const safeName = sanitizeFileName(file.name);
  const storagePath = `purchase-orders/${purchaseOrderId}/${documentType}/v${versionNumber}-${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("purchase_order_documents")
    .insert({
      purchase_order_id: purchaseOrderId,
      document_type: documentType,
      version_number: versionNumber,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: uploadedBy,
      notes: notes?.trim() || null,
    })
    .select(
      "id, purchase_order_id, document_type, version_number, storage_path, file_name, mime_type, file_size, uploaded_by, notes, created_at",
    )
    .single();
  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw error;
  }

  return mapDocument(data as DocumentRow);
}

export async function getPoDocumentDownloadUrl(
  supabase: SupabaseClient,
  documentId: string,
): Promise<{
  url: string;
  file_name: string;
  mime_type: string | null;
  purchase_order_id: string;
}> {
  const { data: doc, error } = await supabase
    .from("purchase_order_documents")
    .select("purchase_order_id, storage_path, file_name, mime_type")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!doc) throw new Error("Document not found.");

  const { data: signed, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL);
  if (signError) throw signError;
  if (!signed?.signedUrl) throw new Error("Failed to generate download URL.");

  return {
    url: signed.signedUrl,
    file_name: doc.file_name,
    mime_type: doc.mime_type,
    purchase_order_id: doc.purchase_order_id,
  };
}

export async function deletePoDocument(
  supabase: SupabaseClient,
  documentId: string,
): Promise<{ purchase_order_id: string }> {
  const { data: doc, error: fetchError } = await supabase
    .from("purchase_order_documents")
    .select("purchase_order_id, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!doc) throw new Error("Document not found.");

  const { error: deleteError } = await supabase
    .from("purchase_order_documents")
    .delete()
    .eq("id", documentId);
  if (deleteError) throw deleteError;

  await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
  return { purchase_order_id: doc.purchase_order_id };
}

export async function deletePoDocuments(
  supabase: SupabaseClient,
  purchaseOrderId: string,
): Promise<void> {
  const { data: rows, error: fetchError } = await supabase
    .from("purchase_order_documents")
    .select("storage_path")
    .eq("purchase_order_id", purchaseOrderId);
  if (fetchError) throw fetchError;

  const { error: deleteError } = await supabase
    .from("purchase_order_documents")
    .delete()
    .eq("purchase_order_id", purchaseOrderId);
  if (deleteError) throw deleteError;

  const storagePaths = (rows ?? []).map((r) => r.storage_path as string);
  if (storagePaths.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths);
  }
}
