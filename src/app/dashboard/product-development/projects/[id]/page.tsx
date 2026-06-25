"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  FileUp,
  MessageSquare,
  LayoutGrid,
  GitBranch,
  GanttChart,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/dashboard/page-shell";
import { PdGantt } from "@/components/product-development/pd-gantt";
import { PdMasterView } from "@/components/product-development/pd-master-view";
import { PdMasterSectionGallery } from "@/components/product-development/pd-master-section-gallery";
import { PdMasterShadesGrid } from "@/components/product-development/pd-master-shades-grid";
import { PdPricingCard } from "@/components/product-development/pd-pricing-card";
import { PdPackagingAssetsEdit } from "@/components/product-development/pd-packaging-assets-edit";
import { PdProjectChat } from "@/components/product-development/pd-project-chat";
import { PdScheduleDateField } from "@/components/product-development/pd-schedule-date-field";
import {
  PdPhaseTable,
  phasesToInput,
  projectPhasesToFormRows,
} from "@/components/product-development/pd-phase-table";
import type { PhaseFormRow } from "@/components/product-development/pd-phase-table";
import {
  PD_PHASE_STATUS_LABELS,
  PD_PHASE_STATUS_STYLES,
  formatPdDateFromIso,
} from "@/lib/product-development/gantt";
import {
  masterImageCategory,
  masterSectionImages,
  PD_MASTER_IMAGE_SECTIONS,
  type PdMasterImageSection,
} from "@/lib/product-development/master-images";
import {
  projectMasterDocumentFile,
  SUPPORTING_DOCUMENT_SLOTS,
  VOLUME_TEST_RESULTS_CATEGORY,
  volumeTestResultsFile,
} from "@/lib/product-development/master-documents";
import { PdMasterFileField } from "@/components/product-development/pd-master-file-field";
import {
  getMasterShadeImages,
  masterShadeImageCategory,
  MASTER_SHADE_BPOM_CATEGORY,
  type MasterShadeImageKind,
} from "@/lib/product-development/master-shades";
import {
  packagingAssetFileCategory,
  PANTONE_SWATCH_FILE_CATEGORY,
} from "@/lib/product-development/master-packaging-assets";
import { cn } from "@/lib/utils";
import type { PdProjectDetail, Profile, PdPackagingItem, Supplier } from "@/types/database";

type MasterFormState = Omit<Partial<PdProjectDetail>, "packaging_items"> & {
  packaging_items?: Omit<PdPackagingItem, "id" | "project_id">[];
};

type TabId = "lifecycle" | "timeline" | "master" | "edit" | "chat";

const TABS: { id: TabId; label: string; icon: typeof GanttChart }[] = [
  { id: "timeline", label: "Gantt timeline", icon: GanttChart },
  { id: "master", label: "Master view", icon: LayoutGrid },
  { id: "lifecycle", label: "Product lifecycle", icon: GitBranch },
  { id: "edit", label: "Edit project", icon: Save },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  active: "bg-sky-100 text-sky-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function PdProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam ?? "timeline");

  const [project, setProject] = useState<PdProjectDetail | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadingMasterSection, setUploadingMasterSection] =
    useState<PdMasterImageSection | null>(null);
  const [uploadingShadeKey, setUploadingShadeKey] = useState<string | null>(null);
  const [uploadingVolumeTest, setUploadingVolumeTest] = useState(false);
  const [uploadingSupportingDoc, setUploadingSupportingDoc] = useState<
    string | null
  >(null);
  const [uploadingBpomShadeId, setUploadingBpomShadeId] = useState<string | null>(
    null,
  );
  const [generatingGs1ShadeId, setGeneratingGs1ShadeId] = useState<string | null>(
    null,
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [savingPricingLineId, setSavingPricingLineId] = useState<string | null>(
    null,
  );
  const [uploadingPricingKey, setUploadingPricingKey] = useState<string | null>(
    null,
  );
  const [uploadingPackagingKey, setUploadingPackagingKey] = useState<
    string | null
  >(null);
  const [uploadingPantoneSwatchId, setUploadingPantoneSwatchId] = useState<
    string | null
  >(null);
  const [generatingPantoneSwatchId, setGeneratingPantoneSwatchId] = useState<
    string | null
  >(null);

  const [editPhases, setEditPhases] = useState<PhaseFormRow[]>([]);
  const [masterForm, setMasterForm] = useState<MasterFormState>({});
  const [cycleDrafts, setCycleDrafts] = useState<Record<string, string>>({});
  const editFormTopRef = useRef<HTMLDivElement>(null);

  const applyProjectToState = useCallback((p: PdProjectDetail) => {
    setProject(p);
    setEditPhases(
      projectPhasesToFormRows(
        p.phases,
        p.npd_approved_entry?.confirmation_date,
      ),
    );
    setMasterForm(p);
    setCycleDrafts(
      Object.fromEntries(
        p.phases.map((ph) => [ph.id, ph.cycle_notes ?? ""]),
      ),
    );
  }, []);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, profilesRes, suppliersRes] = await Promise.all([
        fetch(`/api/product-development/projects/${projectId}`),
        fetch("/api/product-development/profiles"),
        fetch("/api/procurement/suppliers"),
      ]);
      const projectData = await projectRes.json();
      const profilesData = await profilesRes.json();
      const suppliersData = await suppliersRes.json();
      if (!projectRes.ok) {
        throw new Error(projectData.error ?? "Failed to load project");
      }
      const p = projectData.project as PdProjectDetail;
      applyProjectToState(p);
      if (profilesRes.ok) setProfiles(profilesData.profiles ?? []);
      if (suppliersRes.ok) setSuppliers(suppliersData.suppliers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId, applyProjectToState]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  function switchTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(
      `/dashboard/product-development/projects/${projectId}?tab=${tab}`,
      { scroll: false },
    );
  }

  async function saveProject(updates: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-development/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      applyProjectToState(data.project as PdProjectDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function savePhases() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-development/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phases: phasesToInput(editPhases, { scheduleOnly: true }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      applyProjectToState(data.project as PdProjectDetail);
      editFormTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveMasterView() {
    await saveProject({
      product_name: masterForm.product_name,
      manufacturer: masterForm.manufacturer,
      launch_date: masterForm.launch_date,
      product_claim: masterForm.product_claim,
      net_weight: masterForm.net_weight,
      currency: masterForm.currency,
      key_ingredients: masterForm.key_ingredients,
      extract: masterForm.extract,
      full_inci_list: masterForm.full_inci_list,
      shades_list: masterForm.shades_list,
      ingredient_claims: masterForm.ingredient_claims,
      ingredient_concept: masterForm.ingredient_concept,
      colorant_source: masterForm.colorant_source,
      scent_fragrance: masterForm.scent_fragrance,
      precautions: masterForm.precautions,
      halal_certification: masterForm.halal_certification,
      packaging_items: masterForm.packaging_items,
    });
  }

  async function saveCycleNote(phaseId: string) {
    const notes = cycleDrafts[phaseId] ?? "";
    const res = await fetch(
      `/api/product-development/projects/${projectId}/cycle-notes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_id: phaseId, cycle_notes: notes }),
      },
    );
    if (res.ok) await loadProject();
  }

  async function uploadFile(
    file: File,
    opts: {
      phase_id?: string;
      component_id?: string;
      file_category?: string;
    },
  ) {
    const key = opts.phase_id ?? opts.component_id ?? opts.file_category ?? "project";
    setUploading(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (opts.phase_id) formData.append("phase_id", opts.phase_id);
      if (opts.component_id) formData.append("component_id", opts.component_id);
      if (opts.file_category) formData.append("file_category", opts.file_category);
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function uploadMasterImage(section: PdMasterImageSection, file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, WebP, or GIF).");
      return;
    }
    setUploadingMasterSection(section);
    try {
      await uploadFile(file, { file_category: masterImageCategory(section) });
    } finally {
      setUploadingMasterSection(null);
    }
  }

  async function deleteMasterImage(fileId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files?file_id=${fileId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete image");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
    }
  }

  async function addMasterShade() {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/master-shades`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shade_name: "New shade",
            sort_order: project?.master_shades.length ?? 0,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add shade");
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add shade");
    }
  }

  async function updateMasterShadeName(shadeId: string, shadeName: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/master-shades/${shadeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shade_name: shadeName }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update shade");
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shade");
    }
  }

  async function deleteMasterShade(shadeId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/master-shades/${shadeId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete shade");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete shade");
    }
  }

  async function uploadMasterShadeImage(
    shadeId: string,
    kind: MasterShadeImageKind,
    file: File,
  ) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, WebP, or GIF).");
      return;
    }
    const key = `${shadeId}:${kind}`;
    setUploadingShadeKey(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("master_shade_id", shadeId);
      formData.append("file_category", masterShadeImageCategory(kind));
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingShadeKey(null);
    }
  }

  async function uploadVolumeTestFile(file: File) {
    setUploadingVolumeTest(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("file_category", VOLUME_TEST_RESULTS_CATEGORY);
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingVolumeTest(false);
    }
  }

  async function deleteVolumeTestFile() {
    const file = project ? volumeTestResultsFile(project.files) : null;
    if (!file) return;
    setUploadingVolumeTest(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files?file_id=${file.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete file");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    } finally {
      setUploadingVolumeTest(false);
    }
  }

  async function uploadSupportingDocumentFile(category: string, file: File) {
    setUploadingSupportingDoc(category);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("file_category", category);
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSupportingDoc(null);
    }
  }

  async function deleteSupportingDocumentFile(category: string) {
    const file = project ? projectMasterDocumentFile(project.files, category) : null;
    if (!file) return;
    setUploadingSupportingDoc(category);
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files?file_id=${file.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete file");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    } finally {
      setUploadingSupportingDoc(null);
    }
  }

  async function updateMasterShadeRegulatory(
    shadeId: string,
    patch: { lab_no?: string | null; gs1?: string | null },
  ) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/master-shades/${shadeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update shade");
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shade");
    }
  }

  async function uploadBpomFile(shadeId: string, file: File) {
    setUploadingBpomShadeId(shadeId);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("master_shade_id", shadeId);
      formData.append("file_category", MASTER_SHADE_BPOM_CATEGORY);
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingBpomShadeId(null);
    }
  }

  async function deleteBpomFile(_shadeId: string, fileId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files?file_id=${fileId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete file");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  async function generateGs1Barcode(shadeId: string) {
    setGeneratingGs1ShadeId(shadeId);
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/master-shades/${shadeId}/gs1-barcode`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate barcode");
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate barcode");
    } finally {
      setGeneratingGs1ShadeId(null);
    }
  }

  async function updatePricingLine(
    lineId: string,
    patch: {
      amount?: number | null;
      moq?: string | null;
      supplier_id?: string | null;
      offer_note?: string | null;
    },
  ) {
    setSavingPricingLineId(lineId);
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/pricing-lines/${lineId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update pricing line");
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pricing");
    } finally {
      setSavingPricingLineId(null);
    }
  }

  async function updatePricingHeader(patch: {
    retail_price?: number | null;
    asp?: number | null;
    pricing_rmb_rate?: number | null;
    pricing_usd_rate?: number | null;
    pricing_note?: string | null;
  }) {
    setError(null);
    try {
      const res = await fetch(`/api/product-development/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update pricing");
      setProject(data.project);
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pricing");
    }
  }

  async function uploadPricingFile(
    lineId: string,
    category: string,
    file: File,
  ) {
    setUploadingPricingKey(`${lineId}:${category}`);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("pricing_line_id", lineId);
      formData.append("file_category", category);
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingPricingKey(null);
    }
  }

  async function deletePricingFile(fileId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files?file_id=${fileId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete file");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  async function updatePackagingAssetField(
    fieldKey: string,
    value: string | null,
  ) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/packaging-asset-fields`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_key: fieldKey, value }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update field");
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update field");
    }
  }

  async function uploadPackagingAssetFile(
    section: "primary" | "secondary",
    rowKey: string,
    file: File,
  ) {
    const key = `${section}:${rowKey}`;
    setUploadingPackagingKey(key);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "file_category",
        packagingAssetFileCategory(section, rowKey),
      );
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingPackagingKey(null);
    }
  }

  async function addPantoneSwatch(colorName: string, pantoneCode: string) {
    setError(null);
    setGeneratingPantoneSwatchId("new");
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/pantone-swatches`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            color_name: colorName,
            pantone_code: pantoneCode,
            sort_order: project?.pantone_swatches.length ?? 0,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add Pantone");
      if (data.warning) setError(data.warning);
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add Pantone");
    } finally {
      setGeneratingPantoneSwatchId(null);
    }
  }

  async function updatePantoneSwatch(
    swatchId: string,
    patch: { color_name?: string; pantone_code?: string },
  ) {
    setError(null);
    if (patch.pantone_code != null) {
      setGeneratingPantoneSwatchId(swatchId);
    }
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/pantone-swatches/${swatchId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update Pantone");
      if (data.warning) setError(data.warning);
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Pantone");
    } finally {
      setGeneratingPantoneSwatchId(null);
    }
  }

  async function deletePantoneSwatch(swatchId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/product-development/projects/${projectId}/pantone-swatches/${swatchId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete Pantone");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete Pantone");
    }
  }

  async function uploadPantoneSwatchFile(swatchId: string, file: File) {
    setUploadingPantoneSwatchId(swatchId);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("pantone_swatch_id", swatchId);
      formData.append("file_category", PANTONE_SWATCH_FILE_CATEGORY);
      const res = await fetch(
        `/api/product-development/projects/${projectId}/files`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingPantoneSwatchId(null);
    }
  }

  const sortedPhases = useMemo(
    () => [...(project?.phases ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [project],
  );

  const parentPhaseIds = useMemo(
    () =>
      new Set(
        sortedPhases
          .map((p) => p.parent_phase_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [sortedPhases],
  );

  if (loading) {
    return (
      <PageShell>
        <p className="text-sm text-stone-500">Loading project…</p>
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <p className="text-sm text-rose-600">{error ?? "Project not found."}</p>
        <Link
          href="/dashboard/product-development/projects"
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Back to projects
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      <div className="mb-2">
        <Link
          href="/dashboard/product-development/projects"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          <ArrowLeft className="h-4 w-4" />
          All projects
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-stone-900">
              {project.name}
            </h1>
            <Badge className={STATUS_STYLES[project.status] ?? ""}>
              {project.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {project.product_name ?? project.description ?? "Product development project"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-stone-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-stone-500 hover:text-stone-800",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {activeTab === "lifecycle" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Product development lifecycle</CardTitle>
              <CardDescription>
                Document what happened in each cycle. Notes feed into the master
                view and timeline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {sortedPhases.map((phase) => {
                const isParent =
                  phase.is_root_task || parentPhaseIds.has(phase.id);
                return (
                <div
                  key={phase.id}
                  className={cn(
                    "rounded-lg border border-stone-200 overflow-hidden",
                    !isParent && "ml-6 border-stone-100",
                  )}
                >
                  <div
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 px-4 py-3",
                      isParent ? "bg-emerald-50" : "bg-stone-50",
                    )}
                  >
                    <div>
                      <p
                        className={cn(
                          "text-stone-900",
                          isParent ? "font-semibold" : "text-sm font-medium",
                        )}
                      >
                        {phase.name}
                      </p>
                    </div>
                    <Badge className={PD_PHASE_STATUS_STYLES[phase.status]}>
                      {PD_PHASE_STATUS_LABELS[phase.status]}
                    </Badge>
                  </div>
                  <div className="space-y-3 p-4">
                    {phase.description && (
                      <p className="text-sm text-stone-600">{phase.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs text-stone-500">
                      {phase.duration_text && (
                        <span>Duration: {phase.duration_text}</span>
                      )}
                      {phase.start_date && (
                        <span>Start: {formatPdDateFromIso(phase.start_date)}</span>
                      )}
                      {phase.end_date && (
                        <span>Finish: {formatPdDateFromIso(phase.end_date)}</span>
                      )}
                      {phase.pics.length > 0 && (
                        <span>
                          PIC:{" "}
                          {phase.pics
                            .map((p) => p.profile_name)
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      )}
                    </div>
                    <textarea
                      value={cycleDrafts[phase.id] ?? ""}
                      onChange={(e) =>
                        setCycleDrafts((d) => ({
                          ...d,
                          [phase.id]: e.target.value,
                        }))
                      }
                      placeholder="Write notes on what happened in this cycle…"
                      rows={3}
                      className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveCycleNote(phase.id)}
                      >
                        Save notes
                      </Button>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          multiple
                          onChange={(e) => {
                            const files = e.target.files;
                            if (!files) return;
                            Array.from(files).forEach((f) =>
                              uploadFile(f, { phase_id: phase.id }),
                            );
                            e.target.value = "";
                          }}
                        />
                        <span className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
                          <FileUp className="h-3.5 w-3.5" />
                          {uploading === phase.id ? "Uploading…" : "Upload files"}
                        </span>
                      </label>
                    </div>
                    {phase.files.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {phase.files.map((f) => (
                          <a
                            key={f.id}
                            href={f.download_url ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-700 hover:underline"
                          >
                            {f.file_name}
                          </a>
                        ))}
                      </div>
                    )}
                    {phase.components.length > 0 && (
                      <div className="mt-2 space-y-2 border-t border-stone-100 pt-3">
                        <p className="text-xs font-medium text-stone-500">
                          Components
                        </p>
                        {phase.components.map((comp) => (
                          <div
                            key={comp.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded bg-stone-50 px-2 py-1.5 text-sm"
                          >
                            <span>
                              <span className="mr-2 rounded-full border border-stone-200 px-2 py-0.5 text-xs">
                                {comp.component_type}
                              </span>
                              {comp.name}
                            </span>
                            <label className="cursor-pointer text-xs text-emerald-700">
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    uploadFile(file, { component_id: comp.id });
                                  }
                                  e.target.value = "";
                                }}
                              />
                              {uploading === comp.id ? "…" : "+ file"}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Gantt timeline</CardTitle>
            <CardDescription>
              Phases with dependencies shift automatically when earlier phases
              are delayed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PdGantt
              phases={project.phases}
              links={project.phase_links}
              npdConfirmationStartDate={
                project.npd_approved_entry?.confirmation_date
              }
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "master" && (
        <div className="space-y-4">
          <PdMasterView project={project} suppliers={suppliers} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edit master view data</CardTitle>
              <CardDescription>
                Update fields in this section. The master view above is read-only
                — use it to review and download files without accidental edits.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-emerald-900">
                  Product Identity
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["product_name", "Product name"],
                      ["manufacturer", "Manufacturer"],
                      ["product_claim", "Product claim"],
                      ["net_weight", "Net weight"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-stone-600">
                        {label}
                      </label>
                      <Input
                        value={String(masterForm[key] ?? "")}
                        onChange={(e) =>
                          setMasterForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Launch date
                    </label>
                    <PdScheduleDateField
                      variant="form"
                      value={masterForm.launch_date ?? null}
                      onChange={(iso) =>
                        setMasterForm((f) => ({ ...f, launch_date: iso }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-stone-600">
                      Key ingredients
                    </label>
                    <textarea
                      value={masterForm.key_ingredients ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          key_ingredients: e.target.value,
                        }))
                      }
                      rows={3}
                      className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-stone-600">
                      Precautions
                    </label>
                    <textarea
                      value={masterForm.precautions ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          precautions: e.target.value,
                        }))
                      }
                      rows={2}
                      className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-emerald-900">
                  Ingredient Information
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-stone-600">
                      Extract
                    </label>
                    <Input
                      value={masterForm.extract ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({ ...f, extract: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-stone-600">
                      Full Ingredient List
                    </label>
                    <textarea
                      value={masterForm.full_inci_list ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          full_inci_list: e.target.value,
                        }))
                      }
                      rows={4}
                      className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Ingredient Claim
                    </label>
                    <Input
                      value={masterForm.ingredient_claims ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          ingredient_claims: e.target.value,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Ingredient Concept
                    </label>
                    <Input
                      value={masterForm.ingredient_concept ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          ingredient_concept: e.target.value,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Shades List
                    </label>
                    <Input
                      value={masterForm.shades_list ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          shades_list: e.target.value,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Colorant Source
                    </label>
                    <Input
                      value={masterForm.colorant_source ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          colorant_source: e.target.value,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-stone-600">
                      Scent/Fragrance
                    </label>
                    <Input
                      value={masterForm.scent_fragrance ?? ""}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          scent_fragrance: e.target.value,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <PdMasterFileField
                      label="Volume test results"
                      file={
                        project ? volumeTestResultsFile(project.files) : null
                      }
                      editable
                      uploading={uploadingVolumeTest}
                      onUpload={(file) => void uploadVolumeTestFile(file)}
                      onDelete={() => void deleteVolumeTestFile()}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-stone-100 pt-6">
                <h3 className="mb-3 text-sm font-semibold text-emerald-900">
                  Shades
                </h3>
                <p className="mb-3 text-xs text-stone-500">
                  Add shade variants and upload tube and swatch reference images.
                </p>
                <PdMasterShadesGrid
                  project={project}
                  editable
                  uploadingKey={uploadingShadeKey}
                  onAddShade={addMasterShade}
                  onUpdateShadeName={updateMasterShadeName}
                  onDeleteShade={deleteMasterShade}
                  onUploadShadeImage={uploadMasterShadeImage}
                />
              </div>

              <div className="border-t border-stone-100 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-stone-800">
                    Packaging BOM
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setMasterForm((f) => ({
                        ...f,
                        packaging_items: [
                          ...(f.packaging_items ?? []),
                          {
                            part_name: "",
                            part_type: "Primary",
                            supplier_code: "",
                            material_spec: "",
                            sort_order: f.packaging_items?.length ?? 0,
                          },
                        ],
                      }))
                    }
                  >
                    Add part
                  </Button>
                </div>
                <div className="space-y-2">
                  {(masterForm.packaging_items ?? []).map((item, i) => (
                    <div
                      key={i}
                      className="grid gap-2 rounded-md bg-stone-50 p-2 sm:grid-cols-4"
                    >
                      <Input
                        placeholder="Part name"
                        value={item.part_name}
                        onChange={(e) => {
                          const items = [...(masterForm.packaging_items ?? [])];
                          items[i] = { ...items[i], part_name: e.target.value };
                          setMasterForm((f) => ({ ...f, packaging_items: items }));
                        }}
                      />
                      <Input
                        placeholder="Type"
                        value={item.part_type ?? ""}
                        onChange={(e) => {
                          const items = [...(masterForm.packaging_items ?? [])];
                          items[i] = { ...items[i], part_type: e.target.value };
                          setMasterForm((f) => ({ ...f, packaging_items: items }));
                        }}
                      />
                      <Input
                        placeholder="Supplier code"
                        value={item.supplier_code ?? ""}
                        onChange={(e) => {
                          const items = [...(masterForm.packaging_items ?? [])];
                          items[i] = {
                            ...items[i],
                            supplier_code: e.target.value,
                          };
                          setMasterForm((f) => ({ ...f, packaging_items: items }));
                        }}
                      />
                      <Input
                        placeholder="Material spec"
                        value={item.material_spec ?? ""}
                        onChange={(e) => {
                          const items = [...(masterForm.packaging_items ?? [])];
                          items[i] = {
                            ...items[i],
                            material_spec: e.target.value,
                          };
                          setMasterForm((f) => ({ ...f, packaging_items: items }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-stone-100 pt-6">
                <h3 className="mb-3 text-sm font-semibold text-emerald-900">
                  Packaging &amp; Assets Details
                </h3>
                <PdPackagingAssetsEdit
                  project={project}
                  uploadingPackagingKey={uploadingPackagingKey}
                  uploadingPantoneSwatchId={uploadingPantoneSwatchId}
                  generatingPantoneSwatchId={generatingPantoneSwatchId}
                  onUpdateField={(key, value) =>
                    void updatePackagingAssetField(key, value)
                  }
                  onUploadAssetFile={(section, rowKey, file) =>
                    void uploadPackagingAssetFile(section, rowKey, file)
                  }
                  onDeleteFile={(fileId) => void deletePricingFile(fileId)}
                  onAddPantone={(name, code) => void addPantoneSwatch(name, code)}
                  onUpdatePantone={(id, patch) =>
                    void updatePantoneSwatch(id, patch)
                  }
                  onDeletePantone={(id) => void deletePantoneSwatch(id)}
                  onUploadPantoneSwatch={(id, file) =>
                    void uploadPantoneSwatchFile(id, file)
                  }
                />
              </div>

              <div className="border-t border-stone-100 pt-6">
                <h3 className="mb-3 text-sm font-semibold text-emerald-900">
                  Price Information
                </h3>
                <PdPricingCard
                  project={project}
                  suppliers={suppliers}
                  editable
                  embedded
                  savingLineId={savingPricingLineId}
                  uploadingPricingKey={uploadingPricingKey}
                  onUpdateLine={(lineId, patch) =>
                    void updatePricingLine(lineId, patch)
                  }
                  onUpdateHeader={(patch) => void updatePricingHeader(patch)}
                  onUploadPricingFile={(lineId, category, file) =>
                    void uploadPricingFile(lineId, category, file)
                  }
                  onDeletePricingFile={(fileId) => void deletePricingFile(fileId)}
                />
              </div>

              <div className="border-t border-stone-100 pt-6">
                <h3 className="mb-3 text-sm font-semibold text-emerald-900">
                  Product Supporting Files
                </h3>
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Halal certification
                    </label>
                    <Input
                      value={String(masterForm.halal_certification ?? "")}
                      onChange={(e) =>
                        setMasterForm((f) => ({
                          ...f,
                          halal_certification: e.target.value,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                  {SUPPORTING_DOCUMENT_SLOTS.map((slot) => (
                    <div key={slot.category}>
                      <PdMasterFileField
                        label={slot.label}
                        file={
                          project
                            ? projectMasterDocumentFile(
                                project.files,
                                slot.category,
                              )
                            : null
                        }
                        editable
                        uploading={uploadingSupportingDoc === slot.category}
                        onUpload={(file) =>
                          void uploadSupportingDocumentFile(slot.category, file)
                        }
                        onDelete={() =>
                          void deleteSupportingDocumentFile(slot.category)
                        }
                      />
                    </div>
                  ))}
                </div>
                <p className="mb-3 text-xs text-stone-500">
                  NPD Confirmation links automatically when a Formula Tracker
                  trial is approved. Upload BPOM files and enter GS1 codes per
                  shade below.
                </p>
                <div className="space-y-2">
                  {project.master_shades.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      No shades yet — add them in the Shades section above.
                    </p>
                  ) : (
                    [...project.master_shades]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((shade) => {
                        const assets = getMasterShadeImages(
                          project.files,
                          shade.id,
                        );
                        return (
                        <div
                          key={shade.id}
                          className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-3"
                        >
                          <p className="text-sm font-medium text-stone-800">
                            {shade.shade_name}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_auto]">
                          <div>
                            <PdMasterFileField
                              label="BPOM file"
                              file={assets.bpom}
                              editable
                              uploading={uploadingBpomShadeId === shade.id}
                              onUpload={(file) =>
                                void uploadBpomFile(shade.id, file)
                              }
                              onDelete={
                                assets.bpom
                                  ? () =>
                                      void deleteBpomFile(
                                        shade.id,
                                        assets.bpom!.id,
                                      )
                                  : undefined
                              }
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-stone-500">
                              Lab no.
                            </label>
                            <Input
                              key={`${shade.id}-lab-${shade.lab_no ?? ""}`}
                              defaultValue={shade.lab_no ?? ""}
                              onBlur={(e) => {
                                const value = e.target.value.trim() || null;
                                if (value !== (shade.lab_no ?? null)) {
                                  void updateMasterShadeRegulatory(shade.id, {
                                    lab_no: value,
                                  });
                                }
                              }}
                              className="mt-1 h-8 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-stone-500">
                              GS1 (EAN-13)
                            </label>
                            <Input
                              key={`${shade.id}-gs1-${shade.gs1 ?? ""}`}
                              defaultValue={shade.gs1 ?? ""}
                              onBlur={async (e) => {
                                const value = e.target.value.trim() || null;
                                if (value !== (shade.gs1 ?? null)) {
                                  await updateMasterShadeRegulatory(shade.id, {
                                    gs1: value,
                                  });
                                }
                              }}
                              className="mt-1 h-8 text-sm"
                              placeholder="12 or 13 digits"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                !shade.gs1 ||
                                generatingGs1ShadeId === shade.id
                              }
                              onClick={() => void generateGs1Barcode(shade.id)}
                            >
                              {generatingGs1ShadeId === shade.id
                                ? "Generating…"
                                : "Generate GS1 file"}
                            </Button>
                          </div>
                          </div>
                        </div>
                        );
                      })
                  )}
                </div>
              </div>

              <div className="border-t border-stone-100 pt-6">
                <h3 className="mb-1 text-sm font-semibold text-emerald-900">
                  Reference images
                </h3>
                <p className="mb-4 text-xs text-stone-500">
                  Hi-res photos shown in the gallery on each master view card.
                </p>
                <div className="grid gap-6 lg:grid-cols-2">
                  {(
                    Object.entries(PD_MASTER_IMAGE_SECTIONS) as [
                      PdMasterImageSection,
                      string,
                    ][]
                  ).map(([section, label]) => (
                    <div
                      key={section}
                      className="rounded-lg border border-stone-200 bg-stone-50/50 p-3"
                    >
                      <p className="mb-2 text-xs font-medium text-stone-600">
                        {label}
                      </p>
                      <PdMasterSectionGallery
                        images={masterSectionImages(project.files, section)}
                        editable
                        uploading={uploadingMasterSection === section}
                        onUpload={(file) => void uploadMasterImage(section, file)}
                        onDelete={(fileId) => void deleteMasterImage(fileId)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end border-t border-stone-100 pt-4">
                <Button onClick={saveMasterView} disabled={saving}>
                  {saving ? "Saving…" : "Save master view"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "edit" && (
        <div ref={editFormTopRef} className="space-y-4 scroll-mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edit schedule</CardTitle>
              <CardDescription>
                Update tasks, durations, and dates inline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PdPhaseTable
                phases={editPhases}
                onChange={setEditPhases}
                showBulkClearActions
                npdConfirmationStartDate={
                  project.npd_approved_entry?.confirmation_date
                }
              />
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button
              variant="outline"
              className="text-rose-700"
              onClick={async () => {
                if (!confirm("Delete this project permanently?")) return;
                const res = await fetch(
                  `/api/product-development/projects/${projectId}`,
                  { method: "DELETE" },
                );
                if (res.ok) {
                  router.push("/dashboard/product-development/projects");
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete project
            </Button>
            <Button onClick={savePhases} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "chat" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project chat</CardTitle>
            <CardDescription>
              Discuss the project with your team. Type @ to mention someone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PdProjectChat
              projectId={projectId}
              profiles={profiles}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
