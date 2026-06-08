/**
 * Full sales reprocess: re-parse a WMS export with signed RETURNED qty and
 * replace every sale_date present in the file (not just the last 3 months).
 *
 * Usage:
 *   npx tsx scripts/reprocess-all-sales.ts path/to/FTI\ Sales.xlsx
 *   npx tsx scripts/reprocess-all-sales.ts --storage   # latest file in data-uploads/sales
 */
import * as fs from "node:fs";
import { importSalesFromBufferStreaming } from "../src/lib/db/uploads";
import { createAdminClient } from "../src/lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function loadFromStorage(): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const supabase = createAdminClient();
  const { data: files, error } = await supabase.storage.from("data-uploads").list("sales", {
    limit: 50,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw error;
  if (!files?.length) {
    throw new Error("No files in data-uploads/sales bucket.");
  }

  const latest = files.find((f) => f.name && !f.name.endsWith("/"));
  if (!latest?.name) throw new Error("No sales file found in storage.");

  const path = `sales/${latest.name}`;
  const { data, error: downloadError } = await supabase.storage
    .from("data-uploads")
    .download(path);
  if (downloadError) throw downloadError;
  if (!data) throw new Error(`Failed to download ${path}`);

  console.log(`Using storage file: ${path}`);
  return { buffer: await data.arrayBuffer(), filename: latest.name };
}

async function main() {
  const arg = process.argv[2];
  let buffer: ArrayBuffer;
  let filename: string;

  if (arg === "--storage") {
    ({ buffer, filename } = await loadFromStorage());
  } else if (!arg) {
    console.error(
      "Usage: npx tsx scripts/reprocess-all-sales.ts <path-to-FTI-Sales.xlsx>\n" +
        "       npx tsx scripts/reprocess-all-sales.ts --storage",
    );
    process.exit(1);
  } else {
    filename = arg.split(/[/\\]/).pop() ?? arg;
    const fileBuffer = fs.readFileSync(arg);
    buffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
  }

  const supabase = createAdminClient();
  console.log("Streaming full reprocess (signed RETURNED qty)...");
  console.time("import");
  const result = await importSalesFromBufferStreaming(
    supabase,
    Buffer.from(buffer),
    filename,
    "full",
  );
  console.timeEnd("import");
  console.log("Done:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
