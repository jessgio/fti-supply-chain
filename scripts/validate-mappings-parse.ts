import * as fs from "node:fs";
import { parseMappingsExcel } from "../src/lib/excel/parse";

const files = [
  "samples/FTI Product Franchises.xlsx",
  "samples/FTI Bundles and Components.xlsx",
];

for (const file of files) {
  const buffer = fs.readFileSync(file).buffer;
  const { mappings, bundles } = parseMappingsExcel(buffer.slice(0));
  console.log(`\n=== ${file} ===`);
  console.log("Mappings:", mappings.length);
  console.log("Bundles:", bundles.length);
  console.log("Mapping sample:", mappings[0]);
  console.log("Bundle sample:", bundles[0]);
}
