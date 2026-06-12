import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COMPANY_ASSETS_BUCKET,
  COMPANY_LOGO_PREFIX,
  downloadCompanyLogo,
  getCompanySettings,
  removeCompanyLogoFiles,
  updateCompanySettings,
} from "@/lib/db/company-settings";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const settings = await getCompanySettings(supabase);
    if (!settings.logo_path) {
      return NextResponse.json({ error: "No logo uploaded." }, { status: 404 });
    }

    const { data, error } = await supabase.storage
      .from(COMPANY_ASSETS_BUCKET)
      .download(settings.logo_path);
    if (error || !data) {
      return NextResponse.json({ error: "Logo not found." }, { status: 404 });
    }

    const ext = settings.logo_path.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/jpeg";

    const bytes = await data.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose an image file to upload." },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Logo must be PNG, JPEG, WebP, or GIF." },
        { status: 400 },
      );
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Logo must be 2 MB or smaller." },
        { status: 400 },
      );
    }

    const ext = EXT_BY_TYPE[file.type] ?? "png";
    const logoPath = `${COMPANY_LOGO_PREFIX}.${ext}`;
    const supabase = createAdminClient();
    const existing = await getCompanySettings(supabase);

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(COMPANY_ASSETS_BUCKET)
      .upload(logoPath, bytes, {
        contentType: file.type,
        upsert: true,
      });
    if (uploadError) throw uploadError;

    if (existing.logo_path && existing.logo_path !== logoPath) {
      await removeCompanyLogoFiles(supabase, [existing.logo_path]);
    }

    const settings = await updateCompanySettings(supabase, {
      logo_path: logoPath,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const existing = await getCompanySettings(supabase);
    if (existing.logo_path) {
      await removeCompanyLogoFiles(supabase, [existing.logo_path]);
    }
    const settings = await updateCompanySettings(supabase, { logo_path: null });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
