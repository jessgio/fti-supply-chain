import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectEstimatedEnd } from "@/lib/product-development/gantt";
import {
  daysUntilLaunch,
  getUpcomingPhasesWithinDays,
  PROJECT_CARD_COVER_CATEGORY,
} from "@/lib/product-development/project-card";
import { parseDurationText } from "@/lib/product-development/duration";
import { VOLUME_TEST_RESULTS_CATEGORY } from "@/lib/product-development/master-documents";
import {
  MASTER_SHADE_BPOM_CATEGORY,
  MASTER_SHADE_GS1_BARCODE_CATEGORY,
} from "@/lib/product-development/master-shades";
import { renderEan13Png, normalizeEan13 } from "@/lib/product-development/ean13-barcode";
import {
  enrichPantoneSwatches,
  PANTONE_SWATCH_FILE_CATEGORY,
} from "@/lib/product-development/master-packaging-assets";
import { renderPantoneSwatchFromCode } from "@/lib/product-development/pantone-swatch";
import {
  enrichPricingLines,
  PRICING_LINE_DEFS,
  PRICING_OFFER_LETTER_CATEGORY,
  PRICING_STATEMENT_LETTER_CATEGORY,
} from "@/lib/product-development/master-pricing";
import { getApprovedNpdEntryForProductProject } from "@/lib/db/formula-tracker";
import type {
  PdChatMessage,
  PdComponentInput,
  PdCycleNote,
  PdFile,
  PdMasterShade,
  PdPackagingItem,
  PdPantoneSwatch,
  PdPhaseDetail,
  PdPhaseInput,
  PdPhaseLink,
  PdPricingLine,
  PdProject,
  PdProjectDetail,
  PdProjectSummary,
  PdShadeFile,
  Profile,
} from "@/types/database";

const SIGNED_URL_TTL = 3600;

function attachPhaseLinkIds(
  phases: PdPhaseDetail[],
  links: PdPhaseLink[],
): PdPhaseDetail[] {
  return phases.map((phase) => ({
    ...phase,
    depends_on_phase_ids: links
      .filter(
        (l) => l.from_phase_id === phase.id && l.link_type === "depends_on",
      )
      .map((l) => l.to_phase_id),
    parallel_with_phase_ids: links
      .filter(
        (l) => l.from_phase_id === phase.id && l.link_type === "parallel_with",
      )
      .map((l) => l.to_phase_id),
  }));
}

function basePhaseDetail(phase: PdPhaseDetail): PdPhaseDetail {
  return {
    ...phase,
    duration_mode: phase.duration_mode ?? "working_days",
    depends_on_phase_ids: phase.depends_on_phase_ids ?? [],
    parallel_with_phase_ids: phase.parallel_with_phase_ids ?? [],
    pics: phase.pics ?? [],
    components: phase.components ?? [],
    files: phase.files ?? [],
  };
}

export async function listProfiles(
  supabase: SupabaseClient,
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function listPdProjects(
  supabase: SupabaseClient,
): Promise<PdProjectSummary[]> {
  const { data: projects, error } = await supabase
    .from("pd_projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  if (!projects?.length) return [];

  const ids = projects.map((p) => p.id);
  const [phasesRes, linksRes, coverFilesRes] = await Promise.all([
    supabase
      .from("pd_phases")
      .select("*")
      .in("project_id", ids)
      .order("sort_order", { ascending: true }),
    supabase.from("pd_phase_links").select("*").in("project_id", ids),
    supabase
      .from("pd_files")
      .select("id, project_id, storage_path, file_name, mime_type, created_at")
      .in("project_id", ids)
      .eq("file_category", PROJECT_CARD_COVER_CATEGORY)
      .order("created_at", { ascending: false }),
  ]);
  if (phasesRes.error) throw phasesRes.error;
  if (linksRes.error) throw linksRes.error;
  if (coverFilesRes.error) throw coverFilesRes.error;

  const linksByProject = new Map<string, PdPhaseLink[]>();
  for (const link of linksRes.data ?? []) {
    const list = linksByProject.get(link.project_id) ?? [];
    list.push(link as PdPhaseLink);
    linksByProject.set(link.project_id, list);
  }

  const phasesByProject = new Map<string, PdPhaseDetail[]>();
  for (const phase of phasesRes.data ?? []) {
    const list = phasesByProject.get(phase.project_id) ?? [];
    list.push(
      basePhaseDetail({
        ...(phase as PdPhaseDetail),
        depends_on_phase_ids: [],
        parallel_with_phase_ids: [],
        pics: [],
        components: [],
        files: [],
      }),
    );
    phasesByProject.set(phase.project_id, list);
  }

  const coverByProject = new Map<
    string,
    { id: string; storage_path: string }
  >();
  for (const file of coverFilesRes.data ?? []) {
    if (!coverByProject.has(file.project_id)) {
      coverByProject.set(file.project_id, {
        id: file.id,
        storage_path: file.storage_path,
      });
    }
  }

  const coverUrls = new Map<string, string>();
  const coverEntries = [...coverByProject.entries()];
  if (coverEntries.length > 0) {
    const { data: signedData } = await supabase.storage
      .from("data-uploads")
      .createSignedUrls(
        coverEntries.map(([, file]) => file.storage_path),
        SIGNED_URL_TTL,
      );
    const urlByPath = new Map(
      (signedData ?? []).map((r) => [r.path, r.signedUrl ?? null]),
    );
    for (const [projectId, file] of coverEntries) {
      const url = urlByPath.get(file.storage_path);
      if (url) coverUrls.set(projectId, url);
    }
  }

  return projects.map((project) => {
    const projectLinks = linksByProject.get(project.id) ?? [];
    const rawPhases = phasesByProject.get(project.id) ?? [];
    const projectPhases = attachPhaseLinkIds(rawPhases, projectLinks);
    const completed = projectPhases.filter((p) => p.status === "completed").length;
    const nextPhase = projectPhases.find((p) => p.status !== "completed");
    const cover = coverByProject.get(project.id);
    return {
      ...(project as PdProject),
      phase_count: projectPhases.length,
      completed_phases: completed,
      next_phase_name: nextPhase?.name ?? null,
      estimated_end_date: getProjectEstimatedEnd(projectPhases, projectLinks),
      cover_image_url: coverUrls.get(project.id) ?? null,
      cover_image_id: cover?.id ?? null,
      days_until_launch: daysUntilLaunch(project.launch_date),
      upcoming_phases_7d: getUpcomingPhasesWithinDays(projectPhases),
    };
  });
}

async function attachFileUrls(
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

export async function getPdProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<PdProjectDetail | null> {
  const { data: project, error } = await supabase
    .from("pd_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project) return null;

  await ensurePdPricingLines(supabase, projectId);

  const [
    phasesRes,
    linksRes,
    packagingRes,
    shadesRes,
    masterShadesRes,
    pricingLinesRes,
    packagingAssetFieldsRes,
    pantoneSwatchesRes,
    filesRes,
    cycleNotesRes,
    profiles,
  ] = await Promise.all([
    supabase
      .from("pd_phases")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pd_phase_links")
      .select("*")
      .eq("project_id", projectId),
    supabase
      .from("pd_packaging_items")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pd_shade_files")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pd_master_shades")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pd_pricing_lines")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pd_packaging_asset_fields")
      .select("*")
      .eq("project_id", projectId),
    supabase
      .from("pd_pantone_swatches")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pd_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("pd_cycle_notes")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    listProfiles(supabase),
  ]);

  if (phasesRes.error) throw phasesRes.error;
  if (linksRes.error) throw linksRes.error;
  if (packagingRes.error) throw packagingRes.error;
  if (shadesRes.error) throw shadesRes.error;
  if (masterShadesRes.error) throw masterShadesRes.error;
  if (pricingLinesRes.error) throw pricingLinesRes.error;
  if (packagingAssetFieldsRes.error) throw packagingAssetFieldsRes.error;
  if (pantoneSwatchesRes.error) throw pantoneSwatchesRes.error;
  if (filesRes.error) throw filesRes.error;
  if (cycleNotesRes.error) throw cycleNotesRes.error;

  const profileMap = new Map(
    profiles.map((p) => [p.id, p.full_name ?? "Unknown"]),
  );

  const phaseIds = (phasesRes.data ?? []).map((p) => p.id);
  let pics: Array<{ id: string; phase_id: string; profile_id: string }> = [];
  let components: Array<{
    id: string;
    phase_id: string;
    component_type: string;
    name: string;
    description: string | null;
    sort_order: number;
    metadata: Record<string, unknown>;
    created_at: string;
  }> = [];

  if (phaseIds.length > 0) {
    const [picsRes, componentsRes] = await Promise.all([
      supabase.from("pd_phase_pics").select("*").in("phase_id", phaseIds),
      supabase
        .from("pd_phase_components")
        .select("*")
        .in("phase_id", phaseIds)
        .order("sort_order", { ascending: true }),
    ]);
    if (picsRes.error) throw picsRes.error;
    if (componentsRes.error) throw componentsRes.error;
    pics = picsRes.data ?? [];
    components = componentsRes.data ?? [];
  }

  const filesWithUrls = await attachFileUrls(
    supabase,
    (filesRes.data ?? []) as PdFile[],
  );

  const phaseLinks = (linksRes.data ?? []) as PdPhaseLink[];

  const rawPhases: PdPhaseDetail[] = (phasesRes.data ?? []).map((phase) =>
    basePhaseDetail({
      ...(phase as PdPhaseDetail),
      depends_on_phase_ids: [],
      parallel_with_phase_ids: [],
      pics: pics
        .filter((p) => p.phase_id === phase.id)
        .map((p) => ({
          ...p,
          profile_name: profileMap.get(p.profile_id) ?? null,
        })),
      components: components.filter((c) => c.phase_id === phase.id) as PdPhaseDetail["components"],
      files: filesWithUrls.filter((f) => f.phase_id === phase.id),
    }),
  );

  const phases = attachPhaseLinkIds(rawPhases, phaseLinks);

  const cycleNotes: PdCycleNote[] = (cycleNotesRes.data ?? []).map((note) => ({
    ...note,
    author_name: note.created_by
      ? (profileMap.get(note.created_by) ?? null)
      : null,
  }));

  const npdApprovedEntry = await getApprovedNpdEntryForProductProject(
    supabase,
    projectId,
  );

  const rawPricingLines = (pricingLinesRes.data ?? []) as PdPricingLine[];
  const supplierIds = [
    ...new Set(
      rawPricingLines
        .map((line) => line.supplier_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const suppliersById = new Map<
    string,
    { name: string; pic_name: string | null; pic_phone: string | null }
  >();
  if (supplierIds.length > 0) {
    const { data: suppliers, error: suppliersError } = await supabase
      .from("suppliers")
      .select("id, name, pic_name, pic_phone")
      .in("id", supplierIds);
    if (suppliersError) throw suppliersError;
    for (const supplier of suppliers ?? []) {
      suppliersById.set(supplier.id, {
        name: supplier.name,
        pic_name: supplier.pic_name ?? null,
        pic_phone: supplier.pic_phone ?? null,
      });
    }
  }

  const pricing_lines = enrichPricingLines(
    rawPricingLines,
    filesWithUrls,
    suppliersById,
  );

  const packaging_asset_fields: Record<string, string | null> = {};
  for (const row of packagingAssetFieldsRes.data ?? []) {
    packaging_asset_fields[row.field_key] = row.value ?? null;
  }

  const pantone_swatches = enrichPantoneSwatches(
    (pantoneSwatchesRes.data ?? []) as PdPantoneSwatch[],
    filesWithUrls,
  );

  return {
    ...(project as PdProject),
    phases,
    phase_links: phaseLinks,
    packaging_items: (packagingRes.data ?? []) as PdPackagingItem[],
    shade_files: (shadesRes.data ?? []) as PdShadeFile[],
    master_shades: (masterShadesRes.data ?? []) as PdMasterShade[],
    pricing_lines,
    packaging_asset_fields,
    pantone_swatches,
    files: filesWithUrls,
    cycle_notes: cycleNotes,
    npd_approved_entry: npdApprovedEntry,
  };
}

export interface CreatePdProjectInput {
  name: string;
  description?: string | null;
  product_name?: string | null;
  created_by?: string | null;
  phases: PdPhaseInput[];
}

export async function createPdProject(
  supabase: SupabaseClient,
  input: CreatePdProjectInput,
): Promise<PdProjectDetail> {
  const { data: project, error } = await supabase
    .from("pd_projects")
    .insert({
      name: input.name,
      description: input.description ?? null,
      product_name: input.product_name ?? input.name,
      status: "active",
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  await upsertPhases(supabase, project.id, input.phases);
  const detail = await getPdProject(supabase, project.id);
  if (!detail) throw new Error("Failed to load created project");
  return detail;
}

export interface UpdatePdProjectInput {
  name?: string;
  description?: string | null;
  status?: string;
  product_name?: string | null;
  manufacturer?: string | null;
  launch_date?: string | null;
  product_claim?: string | null;
  net_weight?: string | null;
  volume_test_result?: string | null;
  retail_price?: number | null;
  asp?: number | null;
  pricing_rmb_rate?: number | null;
  pricing_usd_rate?: number | null;
  pricing_note?: string | null;
  currency?: string;
  key_ingredients?: string | null;
  extract?: string | null;
  full_inci_list?: string | null;
  shades_list?: string | null;
  ingredient_claims?: string | null;
  ingredient_concept?: string | null;
  colorant_source?: string | null;
  scent_fragrance?: string | null;
  precautions?: string | null;
  halal_certification?: string | null;
  stability_test?: string | null;
  hript?: string | null;
  efficacy_test?: string | null;
  technical_sheet?: string | null;
  master_view_data?: Record<string, unknown>;
  phases?: PdPhaseInput[];
  packaging_items?: Omit<PdPackagingItem, "id" | "project_id">[];
  shade_files?: Omit<PdShadeFile, "id" | "project_id">[];
}

export async function updatePdProject(
  supabase: SupabaseClient,
  projectId: string,
  input: UpdatePdProjectInput,
): Promise<PdProjectDetail> {
  const { phases, packaging_items, shade_files, ...projectFields } = input;

  if (Object.keys(projectFields).length > 0) {
    const { error } = await supabase
      .from("pd_projects")
      .update({ ...projectFields, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) throw error;
  }

  if (phases) {
    await upsertPhases(supabase, projectId, phases);
  }

  if (packaging_items) {
    await supabase
      .from("pd_packaging_items")
      .delete()
      .eq("project_id", projectId);
    if (packaging_items.length > 0) {
      const { error } = await supabase.from("pd_packaging_items").insert(
        packaging_items.map((item, i) => ({
          project_id: projectId,
          part_name: item.part_name,
          part_type: item.part_type,
          supplier_code: item.supplier_code,
          material_spec: item.material_spec,
          sort_order: item.sort_order ?? i,
        })),
      );
      if (error) throw error;
    }
  }

  if (shade_files) {
    await supabase.from("pd_shade_files").delete().eq("project_id", projectId);
    if (shade_files.length > 0) {
      const { error } = await supabase.from("pd_shade_files").insert(
        shade_files.map((item, i) => ({
          project_id: projectId,
          shade_name: item.shade_name,
          lab_no: item.lab_no,
          mpd_confirmation: item.mpd_confirmation,
          bpom: item.bpom,
          gs1: item.gs1,
          sort_order: item.sort_order ?? i,
        })),
      );
      if (error) throw error;
    }
  }

  const detail = await getPdProject(supabase, projectId);
  if (!detail) throw new Error("Project not found after update");
  return detail;
}

async function upsertPhases(
  supabase: SupabaseClient,
  projectId: string,
  phases: PdPhaseInput[],
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_phases")
    .select("id")
    .eq("project_id", projectId);
  const existingIds = new Set((existing ?? []).map((p) => p.id));
  const incomingIds = new Set(
    phases.map((p) => p.id).filter((id): id is string => Boolean(id)),
  );

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from("pd_phases").delete().in("id", toDelete);
  }

  const idMap = new Map<string, string>();

  function resolvePhaseRef(ref: string | null | undefined): string | null {
    if (!ref) return null;
    const mapped = idMap.get(ref);
    if (mapped) return mapped;
    if (existingIds.has(ref)) return ref;
    return null;
  }

  // Pass 1: insert/update phases without dependency FKs (client ids are not in DB yet).
  for (const [index, phase] of phases.entries()) {
    const parsedDuration = parseDurationText(phase.duration_text ?? "");
    const durationDays =
      phase.duration_days ?? parsedDuration.days ?? null;
    const durationMode =
      phase.duration_mode ??
      (parsedDuration.impliesEffective ? "effective_days" : "working_days");

    const phaseRow = {
      project_id: projectId,
      name: phase.name,
      description: phase.description ?? null,
      sort_order: phase.sort_order ?? index,
      is_root_task: phase.is_root_task ?? false,
      parent_phase_id: null as string | null,
      depends_on_phase_id: null as string | null,
      start_date: phase.start_date ?? null,
      end_date: phase.end_date ?? null,
      duration_days: durationDays,
      duration_text: phase.duration_text ?? null,
      duration_mode: durationMode,
      status: phase.status ?? "not_started",
    };

    let phaseId = phase.id;
    if (phaseId && existingIds.has(phaseId)) {
      const { error } = await supabase
        .from("pd_phases")
        .update({ ...phaseRow, updated_at: new Date().toISOString() })
        .eq("id", phaseId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("pd_phases")
        .insert(phaseRow)
        .select("id")
        .single();
      if (error) throw error;
      phaseId = inserted.id;
    }

    if (!phaseId) {
      throw new Error("Failed to resolve phase id");
    }

    if (phase.client_id) idMap.set(phase.client_id, phaseId);
    if (phase.id) idMap.set(phase.id, phaseId);
    idMap.set(phaseId, phaseId);

    await supabase.from("pd_phase_pics").delete().eq("phase_id", phaseId);
    if (phase.pic_profile_ids?.length) {
      const { error } = await supabase.from("pd_phase_pics").insert(
        phase.pic_profile_ids.map((profileId) => ({
          phase_id: phaseId,
          profile_id: profileId,
        })),
      );
      if (error) throw error;
    }

    if (phase.components) {
      await upsertComponents(supabase, phaseId, phase.components);
    }
  }

  // Pass 2: resolve hierarchy refs to real phase ids.
  for (const phase of phases) {
    const phaseId = resolvePhaseRef(phase.id ?? phase.client_id);
    if (!phaseId) continue;

    const parentId = resolvePhaseRef(phase.parent_phase_id);
    const firstDep = resolvePhaseRef(phase.depends_on_phase_ids?.[0]);

    const { error } = await supabase
      .from("pd_phases")
      .update({
        parent_phase_id: parentId,
        depends_on_phase_id: firstDep,
        updated_at: new Date().toISOString(),
      })
      .eq("id", phaseId);
    if (error) throw error;
  }

  // Pass 3: replace many-to-many phase links.
  await supabase.from("pd_phase_links").delete().eq("project_id", projectId);

  const linkRows: Array<{
    project_id: string;
    from_phase_id: string;
    to_phase_id: string;
    link_type: "depends_on" | "parallel_with";
  }> = [];

  for (const phase of phases) {
    const fromId = resolvePhaseRef(phase.id ?? phase.client_id);
    if (!fromId) continue;

    for (const ref of phase.depends_on_phase_ids ?? []) {
      const toId = resolvePhaseRef(ref);
      if (toId) {
        linkRows.push({
          project_id: projectId,
          from_phase_id: fromId,
          to_phase_id: toId,
          link_type: "depends_on",
        });
      }
    }

    for (const ref of phase.parallel_with_phase_ids ?? []) {
      const toId = resolvePhaseRef(ref);
      if (toId) {
        linkRows.push({
          project_id: projectId,
          from_phase_id: fromId,
          to_phase_id: toId,
          link_type: "parallel_with",
        });
      }
    }
  }

  if (linkRows.length > 0) {
    const { error } = await supabase.from("pd_phase_links").insert(linkRows);
    if (error) throw error;
  }
}

async function upsertComponents(
  supabase: SupabaseClient,
  phaseId: string,
  components: PdComponentInput[],
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_phase_components")
    .select("id")
    .eq("phase_id", phaseId);
  const existingIds = new Set((existing ?? []).map((c) => c.id));
  const incomingIds = new Set(
    components.map((c) => c.id).filter((id): id is string => Boolean(id)),
  );
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from("pd_phase_components").delete().in("id", toDelete);
  }

  for (const [index, component] of components.entries()) {
    const row = {
      phase_id: phaseId,
      component_type: component.component_type,
      name: component.name,
      description: component.description ?? null,
      sort_order: component.sort_order ?? index,
    };
    if (component.id && existingIds.has(component.id)) {
      const { error } = await supabase
        .from("pd_phase_components")
        .update(row)
        .eq("id", component.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("pd_phase_components").insert(row);
      if (error) throw error;
    }
  }
}

export async function updatePhaseCycleNotes(
  supabase: SupabaseClient,
  phaseId: string,
  cycleNotes: string,
): Promise<void> {
  const { error } = await supabase
    .from("pd_phases")
    .update({ cycle_notes: cycleNotes, updated_at: new Date().toISOString() })
    .eq("id", phaseId);
  if (error) throw error;
}

export async function addCycleNote(
  supabase: SupabaseClient,
  input: {
    project_id: string;
    phase_id?: string | null;
    title?: string | null;
    notes: string;
    created_by?: string | null;
  },
): Promise<PdCycleNote> {
  const { data, error } = await supabase
    .from("pd_cycle_notes")
    .insert({
      project_id: input.project_id,
      phase_id: input.phase_id ?? null,
      title: input.title ?? null,
      notes: input.notes,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PdCycleNote;
}

export async function listChatMessages(
  supabase: SupabaseClient,
  projectId: string,
): Promise<PdChatMessage[]> {
  const [messagesRes, profiles] = await Promise.all([
    supabase
      .from("pd_chat_messages")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    listProfiles(supabase),
  ]);
  if (messagesRes.error) throw messagesRes.error;
  const profileMap = new Map(
    profiles.map((p) => [p.id, p.full_name ?? "Unknown"]),
  );
  return (messagesRes.data ?? []).map((msg) => ({
    ...msg,
    mentioned_user_ids: msg.mentioned_user_ids ?? [],
    author_name: profileMap.get(msg.author_id) ?? null,
  }));
}

export async function addChatMessage(
  supabase: SupabaseClient,
  input: {
    project_id: string;
    body: string;
    author_id: string;
    mentioned_user_ids?: string[];
  },
): Promise<PdChatMessage> {
  const { data, error } = await supabase
    .from("pd_chat_messages")
    .insert({
      project_id: input.project_id,
      body: input.body,
      author_id: input.author_id,
      mentioned_user_ids: input.mentioned_user_ids ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PdChatMessage;
}

export async function uploadPdFile(
  supabase: SupabaseClient,
  input: {
    project_id: string;
    phase_id?: string | null;
    component_id?: string | null;
    shade_file_id?: string | null;
    master_shade_id?: string | null;
    pricing_line_id?: string | null;
    pantone_swatch_id?: string | null;
    file_name: string;
    storage_path: string;
    mime_type?: string | null;
    file_category?: string | null;
    uploaded_by?: string | null;
  },
): Promise<PdFile> {
  const { data, error } = await supabase
    .from("pd_files")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from("data-uploads")
    .createSignedUrl(data.storage_path, SIGNED_URL_TTL);

  return { ...data, download_url: signed?.signedUrl ?? null } as PdFile;
}

export async function deletePdFile(
  supabase: SupabaseClient,
  fileId: string,
): Promise<void> {
  const { data: file, error: fetchError } = await supabase
    .from("pd_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!file) return;

  await supabase.storage.from("data-uploads").remove([file.storage_path]);
  const { error } = await supabase.from("pd_files").delete().eq("id", fileId);
  if (error) throw error;
}

export async function createPdMasterShade(
  supabase: SupabaseClient,
  projectId: string,
  input: { shade_name: string; sort_order?: number },
): Promise<PdMasterShade> {
  const { data, error } = await supabase
    .from("pd_master_shades")
    .insert({
      project_id: projectId,
      shade_name: input.shade_name,
      sort_order: input.sort_order ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PdMasterShade;
}

export async function updatePdMasterShade(
  supabase: SupabaseClient,
  shadeId: string,
  input: {
    shade_name?: string;
    sort_order?: number;
    lab_no?: string | null;
    gs1?: string | null;
  },
): Promise<PdMasterShade> {
  const { data, error } = await supabase
    .from("pd_master_shades")
    .update(input)
    .eq("id", shadeId)
    .select("*")
    .single();
  if (error) throw error;
  return data as PdMasterShade;
}

export async function deletePdMasterShade(
  supabase: SupabaseClient,
  shadeId: string,
): Promise<void> {
  const { data: files } = await supabase
    .from("pd_files")
    .select("storage_path")
    .eq("master_shade_id", shadeId);
  if (files?.length) {
    await supabase.storage
      .from("data-uploads")
      .remove(files.map((f) => f.storage_path));
  }
  const { error } = await supabase
    .from("pd_master_shades")
    .delete()
    .eq("id", shadeId);
  if (error) throw error;
}

export async function deletePdMasterShadeImage(
  supabase: SupabaseClient,
  shadeId: string,
  fileCategory: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_files")
    .select("id")
    .eq("master_shade_id", shadeId)
    .eq("file_category", fileCategory);
  if (existing?.length) {
    await Promise.all(existing.map((file) => deletePdFile(supabase, file.id)));
  }
}

export async function generateMasterShadeGs1Barcode(
  supabase: SupabaseClient,
  projectId: string,
  shadeId: string,
  uploadedBy: string | null,
): Promise<PdFile> {
  const { data: shade, error: shadeError } = await supabase
    .from("pd_master_shades")
    .select("gs1")
    .eq("id", shadeId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (shadeError) throw shadeError;
  if (!shade?.gs1?.trim()) {
    throw new Error("Enter a GS1 EAN-13 code before generating the barcode.");
  }

  const ean13 = normalizeEan13(shade.gs1);
  if (!ean13) {
    throw new Error("GS1 must be a valid 12- or 13-digit EAN-13 code.");
  }

  await deletePdMasterShadeImage(
    supabase,
    shadeId,
    MASTER_SHADE_GS1_BARCODE_CATEGORY,
  );

  const png = await renderEan13Png(ean13);
  const storagePath = `product-development/${projectId}/master-shades/${shadeId}/gs1-${ean13}.png`;
  const { error: uploadError } = await supabase.storage
    .from("data-uploads")
    .upload(storagePath, png, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  return uploadPdFile(supabase, {
    project_id: projectId,
    master_shade_id: shadeId,
    file_name: `GS1-${ean13}.png`,
    storage_path: storagePath,
    mime_type: "image/png",
    file_category: MASTER_SHADE_GS1_BARCODE_CATEGORY,
    uploaded_by: uploadedBy,
  });
}

export async function deletePdProjectCardCover(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("file_category", PROJECT_CARD_COVER_CATEGORY);
  if (existing?.length) {
    await Promise.all(existing.map((file) => deletePdFile(supabase, file.id)));
  }
}

export async function deletePdVolumeTestResultsFile(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  await deletePdProjectDocumentFile(
    supabase,
    projectId,
    VOLUME_TEST_RESULTS_CATEGORY,
  );
}

export async function deletePdProjectDocumentFile(
  supabase: SupabaseClient,
  projectId: string,
  fileCategory: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("file_category", fileCategory);
  if (existing?.length) {
    await Promise.all(existing.map((file) => deletePdFile(supabase, file.id)));
  }
}

async function ensurePdPricingLines(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("pd_pricing_lines")
    .select("line_key")
    .eq("project_id", projectId);
  if (error) throw error;

  const existingKeys = new Set((existing ?? []).map((row) => row.line_key));
  const missing = PRICING_LINE_DEFS.filter((def) => !existingKeys.has(def.key));
  if (missing.length === 0) return;

  const { error: insertError } = await supabase.from("pd_pricing_lines").insert(
    missing.map((def) => ({
      project_id: projectId,
      line_key: def.key,
      sort_order: def.sort_order,
    })),
  );
  if (insertError) throw insertError;
}

export async function updatePdPricingLine(
  supabase: SupabaseClient,
  projectId: string,
  lineId: string,
    patch: {
      amount?: number | null;
      moq?: string | null;
      supplier_id?: string | null;
      offer_note?: string | null;
    },
): Promise<void> {
  const { error } = await supabase
    .from("pd_pricing_lines")
    .update(patch)
    .eq("id", lineId)
    .eq("project_id", projectId);
  if (error) throw error;
}

export async function deletePdPricingLineFile(
  supabase: SupabaseClient,
  pricingLineId: string,
  fileCategory: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_files")
    .select("id")
    .eq("pricing_line_id", pricingLineId)
    .eq("file_category", fileCategory);
  if (existing?.length) {
    await Promise.all(existing.map((file) => deletePdFile(supabase, file.id)));
  }
}

export async function upsertPdPackagingAssetField(
  supabase: SupabaseClient,
  projectId: string,
  fieldKey: string,
  value: string | null,
): Promise<void> {
  const { error } = await supabase.from("pd_packaging_asset_fields").upsert(
    {
      project_id: projectId,
      field_key: fieldKey,
      value,
    },
    { onConflict: "project_id,field_key" },
  );
  if (error) throw error;
}

export async function deletePdPackagingAssetFile(
  supabase: SupabaseClient,
  projectId: string,
  fileCategory: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("file_category", fileCategory);
  if (existing?.length) {
    await Promise.all(existing.map((file) => deletePdFile(supabase, file.id)));
  }
}

export async function deletePdPantoneSwatchFile(
  supabase: SupabaseClient,
  swatchId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("pd_files")
    .select("id")
    .eq("pantone_swatch_id", swatchId)
    .eq("file_category", "pantone_swatch");
  if (existing?.length) {
    await Promise.all(existing.map((file) => deletePdFile(supabase, file.id)));
  }
}

export async function createPdPantoneSwatch(
  supabase: SupabaseClient,
  projectId: string,
  input: { color_name: string; pantone_code: string; sort_order?: number },
): Promise<PdPantoneSwatch> {
  const { data, error } = await supabase
    .from("pd_pantone_swatches")
    .insert({
      project_id: projectId,
      color_name: input.color_name,
      pantone_code: input.pantone_code,
      sort_order: input.sort_order ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PdPantoneSwatch;
}

export async function updatePdPantoneSwatch(
  supabase: SupabaseClient,
  projectId: string,
  swatchId: string,
  patch: {
    color_name?: string;
    pantone_code?: string;
    sort_order?: number;
    hex_color?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("pd_pantone_swatches")
    .update(patch)
    .eq("id", swatchId)
    .eq("project_id", projectId);
  if (error) throw error;
}

export async function generatePdPantoneSwatchImage(
  supabase: SupabaseClient,
  projectId: string,
  swatchId: string,
  uploadedBy: string | null,
): Promise<PdFile> {
  const { data: swatch, error: swatchError } = await supabase
    .from("pd_pantone_swatches")
    .select("pantone_code, color_name")
    .eq("id", swatchId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (swatchError) throw swatchError;
  if (!swatch?.pantone_code?.trim()) {
    throw new Error("Enter a Pantone code before generating the swatch.");
  }

  const { hex, svg } = renderPantoneSwatchFromCode(
    swatch.pantone_code,
    swatch.color_name,
  );

  await deletePdPantoneSwatchFile(supabase, swatchId);

  const slug = swatch.pantone_code
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const storagePath = `product-development/${projectId}/pantone-swatches/${swatchId}/${slug || "swatch"}.svg`;
  const svgBuffer = Buffer.from(svg, "utf-8");

  const { error: uploadError } = await supabase.storage
    .from("data-uploads")
    .upload(storagePath, svgBuffer, {
      contentType: "image/svg+xml",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  await updatePdPantoneSwatch(supabase, projectId, swatchId, { hex_color: hex });

  return uploadPdFile(supabase, {
    project_id: projectId,
    pantone_swatch_id: swatchId,
    file_name: `PANTONE-${slug || swatchId}.svg`,
    storage_path: storagePath,
    mime_type: "image/svg+xml",
    file_category: PANTONE_SWATCH_FILE_CATEGORY,
    uploaded_by: uploadedBy,
  });
}

export async function deletePdPantoneSwatch(
  supabase: SupabaseClient,
  projectId: string,
  swatchId: string,
): Promise<void> {
  await deletePdPantoneSwatchFile(supabase, swatchId);
  const { error } = await supabase
    .from("pd_pantone_swatches")
    .delete()
    .eq("id", swatchId)
    .eq("project_id", projectId);
  if (error) throw error;
}

export {
  PRICING_OFFER_LETTER_CATEGORY,
  PRICING_STATEMENT_LETTER_CATEGORY,
};

export async function deletePdProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { data: files } = await supabase
    .from("pd_files")
    .select("storage_path")
    .eq("project_id", projectId);
  if (files?.length) {
    await supabase.storage
      .from("data-uploads")
      .remove(files.map((f) => f.storage_path));
  }
  const { error } = await supabase
    .from("pd_projects")
    .delete()
    .eq("id", projectId);
  if (error) throw error;
}
