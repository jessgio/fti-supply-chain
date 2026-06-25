import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import { deletePdFile, deletePdMasterShadeImage, deletePdPackagingAssetFile, deletePdPantoneSwatchFile, deletePdPricingLineFile, deletePdProjectCardCover, deletePdProjectDocumentFile, deletePdVolumeTestResultsFile, uploadPdFile, PRICING_OFFER_LETTER_CATEGORY, PRICING_STATEMENT_LETTER_CATEGORY } from "@/lib/db/product-development";
import {
  isPackagingAssetFileCategory,
  PANTONE_SWATCH_FILE_CATEGORY,
} from "@/lib/product-development/master-packaging-assets";
import {
  MASTER_SHADE_BPOM_CATEGORY,
  MASTER_SHADE_SWATCH_CATEGORY,
  MASTER_SHADE_TUBE_CATEGORY,
} from "@/lib/product-development/master-shades";
import {
  isSupportingDocumentCategory,
  VOLUME_TEST_RESULTS_CATEGORY,
} from "@/lib/product-development/master-documents";
import { PROJECT_CARD_COVER_CATEGORY } from "@/lib/product-development/project-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    const { id: projectId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 50 MB limit." }, { status: 400 });
    }

    const phaseId = formData.get("phase_id")?.toString() || null;
    const componentId = formData.get("component_id")?.toString() || null;
    const shadeFileId = formData.get("shade_file_id")?.toString() || null;
    const masterShadeId = formData.get("master_shade_id")?.toString() || null;
    const pricingLineId = formData.get("pricing_line_id")?.toString() || null;
    const pantoneSwatchId = formData.get("pantone_swatch_id")?.toString() || null;
    const fileCategory = formData.get("file_category")?.toString() || null;

    if (
      masterShadeId &&
      fileCategory &&
      (fileCategory === MASTER_SHADE_TUBE_CATEGORY ||
        fileCategory === MASTER_SHADE_SWATCH_CATEGORY ||
        fileCategory === MASTER_SHADE_BPOM_CATEGORY)
    ) {
      await deletePdMasterShadeImage(
        createAdminClient(),
        masterShadeId,
        fileCategory,
      );
    }

    if (
      pricingLineId &&
      fileCategory &&
      (fileCategory === PRICING_OFFER_LETTER_CATEGORY ||
        fileCategory === PRICING_STATEMENT_LETTER_CATEGORY)
    ) {
      await deletePdPricingLineFile(
        createAdminClient(),
        pricingLineId,
        fileCategory,
      );
    }

    if (fileCategory === PROJECT_CARD_COVER_CATEGORY) {
      await deletePdProjectCardCover(createAdminClient(), projectId);
    }

    if (fileCategory === VOLUME_TEST_RESULTS_CATEGORY) {
      await deletePdVolumeTestResultsFile(createAdminClient(), projectId);
    }

    if (fileCategory && isSupportingDocumentCategory(fileCategory)) {
      await deletePdProjectDocumentFile(
        createAdminClient(),
        projectId,
        fileCategory,
      );
    }

    if (fileCategory && isPackagingAssetFileCategory(fileCategory)) {
      await deletePdPackagingAssetFile(
        createAdminClient(),
        projectId,
        fileCategory,
      );
    }

    if (pantoneSwatchId && fileCategory === PANTONE_SWATCH_FILE_CATEGORY) {
      await deletePdPantoneSwatchFile(createAdminClient(), pantoneSwatchId);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `product-development/${projectId}/${Date.now()}-${safeName}`;

    const supabase = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("data-uploads")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const record = await uploadPdFile(supabase, {
      project_id: projectId,
      phase_id: phaseId,
      component_id: componentId,
      shade_file_id: shadeFileId,
      master_shade_id: masterShadeId,
      pricing_line_id: pricingLineId,
      pantone_swatch_id: pantoneSwatchId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      file_category: fileCategory,
      uploaded_by: profile?.id ?? null,
    });

    return NextResponse.json({ file: record }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("file_id");
    if (!fileId) {
      return NextResponse.json({ error: "file_id is required." }, { status: 400 });
    }

    await deletePdFile(createAdminClient(), fileId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
