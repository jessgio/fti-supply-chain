"use client";

import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { PdMasterSectionGallery } from "@/components/product-development/pd-master-section-gallery";
import { PdMasterFileField } from "@/components/product-development/pd-master-file-field";
import { PdMasterShadesGrid } from "@/components/product-development/pd-master-shades-grid";
import { PdPackagingAssetsCard } from "@/components/product-development/pd-packaging-assets-card";
import { PdPricingCard } from "@/components/product-development/pd-pricing-card";
import { PdSupportingFilesTable } from "@/components/product-development/pd-supporting-files-table";
import {
  masterSectionImages,
  type PdMasterImageSection,
} from "@/lib/product-development/master-images";
import {
  projectMasterDocumentFile,
  SUPPORTING_DOCUMENT_SLOTS,
  volumeTestResultsFile,
} from "@/lib/product-development/master-documents";
import type { MasterShadeImageKind } from "@/lib/product-development/master-shades";
import { formatPdDateFromIso } from "@/lib/product-development/gantt";
import type { PdProjectDetail, Supplier } from "@/types/database";

interface PdMasterViewProps {
  project: PdProjectDetail;
  editable?: boolean;
  uploadingSection?: PdMasterImageSection | null;
  uploadingShadeKey?: string | null;
  onUploadImage?: (section: PdMasterImageSection, file: File) => void;
  onDeleteImage?: (fileId: string) => void;
  onAddShade?: () => Promise<void>;
  onUpdateShadeName?: (shadeId: string, name: string) => Promise<void>;
  onDeleteShade?: (shadeId: string) => Promise<void>;
  onUploadShadeImage?: (
    shadeId: string,
    kind: MasterShadeImageKind,
    file: File,
  ) => Promise<void>;
  uploadingVolumeTest?: boolean;
  onUploadVolumeTest?: (file: File) => void;
  onDeleteVolumeTest?: () => void;
  uploadingBpomShadeId?: string | null;
  generatingGs1ShadeId?: string | null;
  onUploadBpom?: (shadeId: string, file: File) => void;
  onDeleteBpom?: (shadeId: string, fileId: string) => void;
  onGenerateGs1?: (shadeId: string) => void;
  suppliers?: Supplier[];
  savingPricingLineId?: string | null;
  uploadingPricingKey?: string | null;
  onUpdatePricingLine?: (
    lineId: string,
    patch: {
      amount?: number | null;
      moq?: string | null;
      supplier_id?: string | null;
      offer_note?: string | null;
    },
  ) => void | Promise<void>;
  onUpdatePricingHeader?: (patch: {
    retail_price?: number | null;
    asp?: number | null;
    pricing_rmb_rate?: number | null;
    pricing_usd_rate?: number | null;
    pricing_note?: string | null;
  }) => void | Promise<void>;
  onUploadPricingFile?: (
    lineId: string,
    category: string,
    file: File,
  ) => void | Promise<void>;
  onDeletePricingFile?: (fileId: string) => void | Promise<void>;
}

function FileLink({
  label,
  href,
}: {
  label: string;
  href?: string | null;
}) {
  if (!href) {
    return <span className="text-stone-400">{label || "—"}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
    >
      <FileText className="h-3.5 w-3.5" />
      {label || "View file"}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function MasterTextBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-stone-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value?.trim() || "—"}</p>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="rounded-t-md bg-emerald-100 px-4 py-2">
      <h3 className="text-sm font-semibold text-emerald-900">{title}</h3>
    </div>
  );
}

function MasterSectionCard({
  section,
  title,
  project,
  editable,
  uploadingSection,
  onUploadImage,
  onDeleteImage,
  children,
}: {
  section: PdMasterImageSection;
  title: string;
  project: PdProjectDetail;
  editable?: boolean;
  uploadingSection?: PdMasterImageSection | null;
  onUploadImage?: (section: PdMasterImageSection, file: File) => void;
  onDeleteImage?: (fileId: string) => void;
  children: React.ReactNode;
}) {
  const images = masterSectionImages(project.files, section);
  const showGallery = images.length > 0 || editable;

  return (
    <Card className="overflow-hidden border-stone-200">
      <SectionHeader title={title} />
      <div
        className={
          showGallery
            ? "grid lg:grid-cols-[minmax(11rem,16rem)_minmax(0,1fr)]"
            : undefined
        }
      >
        {showGallery && (
          <PdMasterSectionGallery
            images={images}
            editable={editable}
            uploading={uploadingSection === section}
            onUpload={
              onUploadImage ? (file) => onUploadImage(section, file) : undefined
            }
            onDelete={onDeleteImage}
          />
        )}
        {children}
      </div>
    </Card>
  );
}

export function PdMasterView({
  project,
  editable = false,
  uploadingSection = null,
  uploadingShadeKey = null,
  onUploadImage,
  onDeleteImage,
  onAddShade,
  onUpdateShadeName,
  onDeleteShade,
  onUploadShadeImage,
  uploadingVolumeTest = false,
  onUploadVolumeTest,
  onDeleteVolumeTest,
  uploadingBpomShadeId = null,
  generatingGs1ShadeId = null,
  onUploadBpom,
  onDeleteBpom,
  onGenerateGs1,
  suppliers = [],
  savingPricingLineId = null,
  uploadingPricingKey = null,
  onUpdatePricingLine,
  onUpdatePricingHeader,
  onUploadPricingFile,
  onDeletePricingFile,
}: PdMasterViewProps) {
  const volumeTestFile = volumeTestResultsFile(project.files);
  const projectFiles = project.files.filter(
    (f) =>
      !f.phase_id &&
      !f.component_id &&
      !f.shade_file_id &&
      !f.master_shade_id,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <MasterSectionCard
          section="product_identity"
          title="Product Identity"
          project={project}
          editable={editable}
          uploadingSection={uploadingSection}
          onUploadImage={onUploadImage}
          onDeleteImage={onDeleteImage}
        >
          <CardContent className="grid gap-3 p-4 text-sm">
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <span className="text-stone-500">Product name</span>
              <span className="font-medium">
                {project.product_name ?? project.name}
              </span>
              <span className="text-stone-500">Launch date</span>
              <span>{formatPdDateFromIso(project.launch_date)}</span>
              <span className="text-stone-500">Manufacturer</span>
              <span>{project.manufacturer ?? "—"}</span>
              <span className="text-stone-500">Product claim</span>
              <span>{project.product_claim ?? "—"}</span>
              <span className="text-stone-500">Net weight</span>
              <span>{project.net_weight ?? "—"}</span>
            </div>
            <MasterTextBlock
              label="Key ingredients"
              value={project.key_ingredients}
            />
            <MasterTextBlock label="Precautions" value={project.precautions} />
          </CardContent>
        </MasterSectionCard>

        <MasterSectionCard
          section="ingredient_info"
          title="Ingredient Information"
          project={project}
          editable={editable}
          uploadingSection={uploadingSection}
          onUploadImage={onUploadImage}
          onDeleteImage={onDeleteImage}
        >
          <CardContent className="space-y-3 p-4 text-sm">
            <MasterTextBlock label="Extract" value={project.extract} />
            <MasterTextBlock
              label="Full Ingredient List"
              value={project.full_inci_list}
            />
            <MasterTextBlock
              label="Ingredient Claim"
              value={project.ingredient_claims}
            />
            <MasterTextBlock
              label="Ingredient Concept"
              value={project.ingredient_concept}
            />
            <MasterTextBlock label="Shades/Variants List" value={project.shades_list} />
            <MasterTextBlock
              label="Colorant Source"
              value={project.colorant_source}
            />
            <MasterTextBlock
              label="Scent/Fragrance"
              value={project.scent_fragrance}
            />
            {editable ? (
              <PdMasterFileField
                label="Volume test results"
                file={volumeTestFile}
                editable
                uploading={uploadingVolumeTest}
                onUpload={onUploadVolumeTest}
                onDelete={onDeleteVolumeTest}
              />
            ) : (
              <div>
                <p className="text-xs font-medium uppercase text-stone-500">
                  Volume test results
                </p>
                <div className="mt-1">
                  {volumeTestFile?.download_url ? (
                    <FileLink
                      label={volumeTestFile.file_name}
                      href={volumeTestFile.download_url}
                    />
                  ) : (
                    <p className="text-sm text-stone-400">—</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </MasterSectionCard>
      </div>

      <Card className="overflow-hidden border-stone-200">
        <SectionHeader title="Shades/Variants" />
        <PdMasterShadesGrid
          project={project}
          editable={editable}
          uploadingKey={uploadingShadeKey}
          onAddShade={onAddShade}
          onUpdateShadeName={onUpdateShadeName}
          onDeleteShade={onDeleteShade}
          onUploadShadeImage={onUploadShadeImage}
        />
      </Card>

      <MasterSectionCard
        section="bom"
        title="Product Component Information (BOM)"
        project={project}
        editable={editable}
        uploadingSection={uploadingSection}
        onUploadImage={onUploadImage}
        onDeleteImage={onDeleteImage}
      >
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase text-stone-500">
                  <th className="px-4 py-2">Part name</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Material spec</th>
                </tr>
              </thead>
              <tbody>
                {project.packaging_items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-stone-500"
                    >
                      No packaging components added yet.
                    </td>
                  </tr>
                ) : (
                  project.packaging_items.map((item) => (
                    <tr key={item.id} className="border-b border-stone-100">
                      <td className="px-4 py-2 font-medium">{item.part_name}</td>
                      <td className="px-4 py-2">{item.part_type ?? "—"}</td>
                      <td className="px-4 py-2">{item.supplier_code ?? "—"}</td>
                      <td className="px-4 py-2">{item.material_spec ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </MasterSectionCard>

      <PdPackagingAssetsCard project={project} />

      <PdPricingCard
        project={project}
        suppliers={suppliers}
        editable={editable}
        savingLineId={savingPricingLineId}
        uploadingPricingKey={uploadingPricingKey}
        onUpdateLine={onUpdatePricingLine}
        onUpdateHeader={onUpdatePricingHeader}
        onUploadPricingFile={onUploadPricingFile}
        onDeletePricingFile={onDeletePricingFile}
      />

      <MasterSectionCard
        section="supporting_files"
        title="Product Supporting Files"
        project={project}
        editable={editable}
        uploadingSection={uploadingSection}
        onUploadImage={onUploadImage}
        onDeleteImage={onDeleteImage}
      >
        <CardContent className="p-0">
          <PdSupportingFilesTable
            project={project}
            editable={editable}
            uploadingBpomShadeId={uploadingBpomShadeId}
            generatingGs1ShadeId={generatingGs1ShadeId}
            onUploadBpom={onUploadBpom}
            onDeleteBpom={onDeleteBpom}
            onGenerateGs1={onGenerateGs1}
          />
          <div className="grid gap-2 border-t border-stone-200 p-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-stone-500">Halal: </span>
              {project.halal_certification ?? "—"}
            </div>
            {SUPPORTING_DOCUMENT_SLOTS.map((slot) => {
              const file = projectMasterDocumentFile(project.files, slot.category);
              return (
                <div key={slot.category}>
                  <span className="text-stone-500">{slot.label}: </span>
                  {file?.download_url ? (
                    <FileLink label={file.file_name} href={file.download_url} />
                  ) : (
                    "—"
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </MasterSectionCard>

      {project.phases.some((p) => p.components.length > 0) && (
        <Card className="overflow-hidden border-stone-200">
          <SectionHeader title="Phase Components & Files" />
          <CardContent className="space-y-4 p-4">
            {project.phases.map((phase) =>
              phase.components.length > 0 ? (
                <div key={phase.id}>
                  <p className="text-sm font-semibold text-stone-800">
                    {phase.name}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {phase.components.map((comp) => {
                      const compFiles = project.files.filter(
                        (f) => f.component_id === comp.id,
                      );
                      return (
                        <li
                          key={comp.id}
                          className="rounded-md border border-stone-100 bg-stone-50 px-3 py-2 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-stone-200 px-2 py-0.5 text-xs">
                              {comp.component_type.replace(/_/g, " ")}
                            </span>
                            <span className="font-medium">{comp.name}</span>
                          </div>
                          {comp.description && (
                            <p className="mt-1 text-xs text-stone-600">
                              {comp.description}
                            </p>
                          )}
                          {compFiles.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-3">
                              {compFiles.map((f) => (
                                <FileLink
                                  key={f.id}
                                  label={f.file_name}
                                  href={f.download_url}
                                />
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null,
            )}
          </CardContent>
        </Card>
      )}

      {projectFiles.filter(
        (f) =>
          !f.file_category?.startsWith("master_image:") &&
          f.file_category !== "volume_test_results" &&
          f.file_category !== "project_card_cover" &&
          !SUPPORTING_DOCUMENT_SLOTS.some((slot) => slot.category === f.file_category),
      ).length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-3 p-4">
            <p className="w-full text-sm font-semibold text-stone-800">
              Other project files
            </p>
            {projectFiles
              .filter(
                (f) =>
                  !f.file_category?.startsWith("master_image:") &&
                  f.file_category !== "volume_test_results" &&
                  f.file_category !== "project_card_cover" &&
                  !SUPPORTING_DOCUMENT_SLOTS.some(
                    (slot) => slot.category === f.file_category,
                  ),
              )
              .map((f) => (
                <FileLink key={f.id} label={f.file_name} href={f.download_url} />
              ))}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-stone-400">
        <Link
          href={`/dashboard/product-development/projects/${project.id}?tab=timeline`}
          className="text-emerald-700 hover:underline"
        >
          View project timeline
        </Link>
      </p>
    </div>
  );
}
