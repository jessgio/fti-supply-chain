import type { SupabaseClient } from "@supabase/supabase-js";
import { deletePdFile } from "@/lib/db/product-development";
import {
  buildTrialTimelines,
  computeApprovalSpan,
} from "@/lib/product-development/formula-tracker-timeline";
import { parseDate, daysBetween } from "@/lib/utils";
import type {
  PdFile,
  PdFormulaTrackerEntry,
  PdFormulaTrackerEntryDetail,
  PdFormulaTrackerEntryInput,
  PdFormulaTrackerMasterProject,
  PdProject,
} from "@/types/database";

const SIGNED_URL_TTL = 3600;

async function attachBriefFileUrls(
  supabase: SupabaseClient,
  files: PdFile[],
): Promise<PdFile[]> {
  if (files.length === 0) return [];
  const { data } = await supabase.storage
    .from("data-uploads")
    .createSignedUrls(
      files.map((f) => f.storage_path),
      SIGNED_URL_TTL,
    );
  const urlByPath = new Map(
    (data ?? []).map((r) => [r.path, r.signedUrl ?? null]),
  );
  return files.map((file) => ({
    ...file,
    download_url: urlByPath.get(file.storage_path) ?? null,
  }));
}

function entryDetail(
  entry: PdFormulaTrackerEntry,
  briefFiles: PdFile[],
  projectName?: string | null,
): PdFormulaTrackerEntryDetail {
  return {
    ...entry,
    brief_files: briefFiles,
    project_name: projectName ?? null,
  };
}

function groupBriefFilesByEntry(
  files: PdFile[],
): Map<string, PdFile[]> {
  const map = new Map<string, PdFile[]>();
  for (const file of files) {
    if (!file.formula_tracker_entry_id) continue;
    const list = map.get(file.formula_tracker_entry_id) ?? [];
    list.push(file);
    map.set(file.formula_tracker_entry_id, list);
  }
  for (const [entryId, list] of map) {
    list.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    map.set(entryId, list);
  }
  return map;
}

export async function listFormulaTrackerEntries(
  supabase: SupabaseClient,
  projectId: string,
): Promise<PdFormulaTrackerEntryDetail[]> {
  const [entriesRes, filesRes, projectRes] = await Promise.all([
    supabase
      .from("pd_formula_tracker_entries")
      .select("*")
      .eq("project_id", projectId)
      .order("sample_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("pd_files")
      .select("*")
      .eq("project_id", projectId)
      .not("formula_tracker_entry_id", "is", null)
      .eq("file_category", "brief_file")
      .order("created_at", { ascending: true }),
    supabase
      .from("pd_projects")
      .select("name, product_name")
      .eq("id", projectId)
      .maybeSingle(),
  ]);

  if (entriesRes.error) throw entriesRes.error;
  if (filesRes.error) throw filesRes.error;
  if (projectRes.error) throw projectRes.error;

  const projectName =
    projectRes.data?.product_name ?? projectRes.data?.name ?? null;

  const allFiles = (filesRes.data ?? []) as PdFile[];
  const filesWithUrls = await attachBriefFileUrls(supabase, allFiles);
  const filesByEntry = groupBriefFilesByEntry(filesWithUrls);

  return (entriesRes.data ?? []).map((entry) =>
    entryDetail(
      entry as PdFormulaTrackerEntry,
      filesByEntry.get(entry.id) ?? [],
      projectName,
    ),
  );
}


function projectTimelineFromEntries(
  project: Pick<PdProject, "id" | "name" | "product_name" | "status">,
  entries: PdFormulaTrackerEntryDetail[],
): PdFormulaTrackerMasterProject {
  const timelines = buildTrialTimelines(entries);
  const datedTrials = timelines.filter((t) => t.entry.sample_date);
  const first = datedTrials[0]?.entry.sample_date ?? null;
  const last = datedTrials.at(-1)?.entry.sample_date ?? null;
  const firstDate = parseDate(first);
  const lastDate = parseDate(last);
  const totalSpanDays =
    firstDate && lastDate ? daysBetween(firstDate, lastDate) : null;
  const approvalSpan = computeApprovalSpan(entries);

  return {
    project_id: project.id,
    project_name: project.name,
    product_name: project.product_name,
    project_status: project.status,
    trial_count: entries.length,
    first_trial_date: first,
    last_trial_date: last,
    total_span_days: totalSpanDays,
    days_first_sample_to_approval: approvalSpan.daysFirstSampleToApproval,
    days_last_sample_to_approval: approvalSpan.daysLastSampleToApproval,
    approved_confirmation_date: approvalSpan.approvedConfirmationDate,
    entries: timelines.map((t) => t.entry),
  };
}

export async function listFormulaTrackerMasterView(
  supabase: SupabaseClient,
): Promise<PdFormulaTrackerMasterProject[]> {
  const [projectsRes, entriesRes, filesRes] = await Promise.all([
    supabase
      .from("pd_projects")
      .select("id, name, product_name, status")
      .order("name", { ascending: true }),
    supabase
      .from("pd_formula_tracker_entries")
      .select("*")
      .order("sample_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("pd_files")
      .select("*")
      .not("formula_tracker_entry_id", "is", null)
      .eq("file_category", "brief_file")
      .order("created_at", { ascending: true }),
  ]);

  if (projectsRes.error) throw projectsRes.error;
  if (entriesRes.error) throw entriesRes.error;
  if (filesRes.error) throw filesRes.error;

  const allFiles = (filesRes.data ?? []) as PdFile[];

  // Batch all signed URLs for the entire master view in one storage call.
  const filesWithUrls = await attachBriefFileUrls(supabase, allFiles);
  const filesByEntry = groupBriefFilesByEntry(filesWithUrls);

  const entriesByProject = new Map<string, PdFormulaTrackerEntryDetail[]>();
  for (const raw of entriesRes.data ?? []) {
    const entry = raw as PdFormulaTrackerEntry;
    const list = entriesByProject.get(entry.project_id) ?? [];
    list.push(entryDetail(entry, filesByEntry.get(entry.id) ?? [], null));
    entriesByProject.set(entry.project_id, list);
  }

  const projects = (projectsRes.data ?? []) as Pick<
    PdProject,
    "id" | "name" | "product_name" | "status"
  >[];

  return projects
    .map((project) =>
      projectTimelineFromEntries(
        project,
        entriesByProject.get(project.id) ?? [],
      ),
    )
    .sort((a, b) => {
      if (a.trial_count > 0 && b.trial_count === 0) return -1;
      if (b.trial_count > 0 && a.trial_count === 0) return 1;
      const aDate = a.last_trial_date ?? "";
      const bDate = b.last_trial_date ?? "";
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return a.project_name.localeCompare(b.project_name);
    });
}

export async function getFormulaTrackerEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<PdFormulaTrackerEntryDetail | null> {
  const { data: entry, error } = await supabase
    .from("pd_formula_tracker_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  if (!entry) return null;

  const [filesRes, projectRes] = await Promise.all([
    supabase
      .from("pd_files")
      .select("*")
      .eq("formula_tracker_entry_id", entryId)
      .eq("file_category", "brief_file")
      .order("created_at", { ascending: true }),
    supabase
      .from("pd_projects")
      .select("name, product_name")
      .eq("id", entry.project_id)
      .maybeSingle(),
  ]);
  if (filesRes.error) throw filesRes.error;
  if (projectRes.error) throw projectRes.error;

  const briefFiles = await attachBriefFileUrls(
    supabase,
    (filesRes.data ?? []) as PdFile[],
  );

  return entryDetail(
    entry as PdFormulaTrackerEntry,
    briefFiles,
    projectRes.data?.product_name ?? projectRes.data?.name ?? null,
  );
}

export const NPD_APPROVED_VALUES = ["Approved"] as const;

export async function getApprovedNpdEntryForProductProject(
  supabase: SupabaseClient,
  productProjectId: string,
): Promise<PdFormulaTrackerEntryDetail | null> {
  const [entryRes, filesRes] = await Promise.all([
    supabase
      .from("pd_formula_tracker_entries")
      .select("*, pd_projects!project_id(name, product_name)")
      .eq("product_project_id", productProjectId)
      .in("npd_confirmation", NPD_APPROVED_VALUES)
      .order("confirmation_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pd_files")
      .select("*")
      .eq("file_category", "brief_file")
      .not("formula_tracker_entry_id", "is", null),
  ]);
  if (entryRes.error) throw entryRes.error;
  if (!entryRes.data) return null;
  if (filesRes.error) throw filesRes.error;

  const raw = entryRes.data as PdFormulaTrackerEntry & {
    pd_projects?: { name: string; product_name: string | null } | null;
  };
  const projectName = raw.pd_projects?.product_name ?? raw.pd_projects?.name ?? null;
  const entryFiles = ((filesRes.data ?? []) as PdFile[]).filter(
    (f) => f.formula_tracker_entry_id === raw.id,
  );
  const filesWithUrls = await attachBriefFileUrls(supabase, entryFiles);

  return entryDetail(raw, filesWithUrls, projectName);
}

export async function createFormulaTrackerEntry(
  supabase: SupabaseClient,
  input: {
    project_id: string;
    created_by?: string | null;
    fields: PdFormulaTrackerEntryInput;
  },
): Promise<PdFormulaTrackerEntryDetail> {
  const { data, error } = await supabase
    .from("pd_formula_tracker_entries")
    .insert({
      project_id: input.project_id,
      created_by: input.created_by ?? null,
      ...input.fields,
    })
    .select("*")
    .single();
  if (error) throw error;

  const detail = await getFormulaTrackerEntry(supabase, data.id);
  if (!detail) throw new Error("Failed to load created entry");
  return detail;
}

export async function updateFormulaTrackerEntry(
  supabase: SupabaseClient,
  entryId: string,
  fields: Partial<PdFormulaTrackerEntryInput>,
): Promise<PdFormulaTrackerEntryDetail> {
  const { error } = await supabase
    .from("pd_formula_tracker_entries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;

  const detail = await getFormulaTrackerEntry(supabase, entryId);
  if (!detail) throw new Error("Entry not found after update");
  return detail;
}

export async function deleteFormulaTrackerEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<void> {
  const { data: files } = await supabase
    .from("pd_files")
    .select("storage_path")
    .eq("formula_tracker_entry_id", entryId);
  if (files?.length) {
    await supabase.storage
      .from("data-uploads")
      .remove(files.map((f) => f.storage_path));
  }

  const { error } = await supabase
    .from("pd_formula_tracker_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

export async function uploadFormulaTrackerBriefFile(
  supabase: SupabaseClient,
  input: {
    project_id: string;
    entry_id: string;
    file_name: string;
    storage_path: string;
    mime_type?: string | null;
    uploaded_by?: string | null;
  },
): Promise<PdFile> {
  const { data, error } = await supabase
    .from("pd_files")
    .insert({
      project_id: input.project_id,
      formula_tracker_entry_id: input.entry_id,
      file_name: input.file_name,
      storage_path: input.storage_path,
      mime_type: input.mime_type ?? null,
      file_category: "brief_file",
      uploaded_by: input.uploaded_by ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from("data-uploads")
    .createSignedUrl(data.storage_path, SIGNED_URL_TTL);

  return { ...data, download_url: signed?.signedUrl ?? null } as PdFile;
}

export async function deleteFormulaTrackerBriefFile(
  supabase: SupabaseClient,
  fileId: string,
): Promise<void> {
  await deletePdFile(supabase, fileId);
}
