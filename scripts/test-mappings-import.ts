import * as fs from "node:fs";
import { parseMappingsExcel } from "../src/lib/excel/parse";
import { importMappings } from "../src/lib/db/uploads";
import { createAdminClient } from "../src/lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const file = process.argv[2] ?? "samples/FTI Bundles and Components.xlsx";
  const buffer = fs.readFileSync(file).buffer;
  const { mappings, bundles } = parseMappingsExcel(buffer.slice(0));
  console.log("Parsed", mappings.length, "mappings,", bundles.length, "bundles");

  const supabase = createAdminClient();

  const { data: tables, error: tableError } = await supabase
    .from("product_franchises")
    .select("id")
    .limit(1);
  if (tableError) {
    console.error("DB check failed:", tableError.message);
    process.exit(1);
  }
  console.log("DB reachable, franchises table ok");

  try {
    const result = await importMappings(
      supabase,
      mappings,
      bundles,
      file.split(/[/\\]/).pop() ?? "test.xlsx",
    );
    console.log("Import OK:", result);
  } catch (err) {
    console.error("Import failed:", err);
    process.exit(1);
  }
}

main();
