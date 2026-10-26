import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  fetchLarkFormFile,
  resolveLarkFormFile,
} from "@/lib/lark/form-file-proxy";

export async function handleLarkFormFileRequest(
  request: Request,
  ownsInstance: (instanceCode: string) => Promise<boolean>,
): Promise<NextResponse> {
  const url = new URL(request.url);
  const instanceCode = url.searchParams.get("instanceCode")?.trim() || "";
  const indexRaw = url.searchParams.get("index")?.trim() || "";
  const title = url.searchParams.get("title");
  const download = url.searchParams.get("download") === "1";

  if (!instanceCode || !/^\d+$/.test(indexRaw)) {
    return NextResponse.json(
      { error: "Missing attachment parameters" },
      { status: 400 },
    );
  }
  const index = Number(indexRaw);
  if (!Number.isSafeInteger(index)) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }

  const allowed = await ownsInstance(instanceCode);
  if (!allowed) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  try {
    const file = await resolveLarkFormFile({ instanceCode, index, title });
    if (!file) {
      return NextResponse.json(
        { error: "Attachment not found. Refresh status and try again." },
        { status: 404 },
      );
    }
    const streamed = await fetchLarkFormFile(file, download);
    return new NextResponse(streamed.body, { headers: streamed.headers });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Failed to load attachment" },
      { status: 502 },
    );
  }
}
