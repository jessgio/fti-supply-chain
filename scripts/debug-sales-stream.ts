import * as fs from "node:fs";
import { parseFtiSalesXlsxStream } from "../src/lib/excel/wms-sales-stream";

// Patch by counting raw rows - import internals via duplicate small test
import { XMLParser } from "fast-xml-parser";
import yauzl from "yauzl";
import { SaxesParser } from "saxes";

const buffer = fs.readFileSync("samples/FTI Sales.xlsx");

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) reject(err);
      else resolve(zip);
    });
  });
}

async function debug() {
  let rowCount = 0;
  let header: string[] = [];
  const zip = await openZip(buffer);
  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (entry) => {
      if (entry.fileName !== "xl/worksheets/sheet1.xml") {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err);
        const parser = new SaxesParser({ xmlns: true });
        let inV = false;
        let cellText = "";
        let rowCells: string[] = [];
        parser.on("opentag", (t) => {
          const n = t.name.replace(/^.*:/, "");
          if (n === "v") inV = true;
        });
        parser.on("text", (txt) => {
          if (inV) cellText += txt;
        });
        parser.on("closetag", (t) => {
          const n = t.name.replace(/^.*:/, "");
          if (n === "v") inV = false;
          if (n === "c") {
            rowCells.push(cellText);
            cellText = "";
          }
          if (n === "row") {
            rowCount++;
            if (rowCount === 1) header = [...rowCells];
            if (rowCount <= 3) console.log("row", rowCount, rowCells.slice(0, 15));
            rowCells = [];
          }
        });
        stream.on("data", (c) => parser.write(c.toString("utf8")));
        stream.on("end", () => {
          parser.close();
          resolve();
        });
        stream.on("error", reject);
      });
    });
    zip.on("end", () => resolve());
    zip.readEntry();
  });
  zip.close();
  console.log("streamed rows", rowCount);
  console.log("header sample", header.slice(0, 15));

  const rows = await parseFtiSalesXlsxStream(buffer);
  const neg = rows.filter((r) => r.qty_sold < 0);
  const trm = rows.filter(
    (r) =>
      r.sku_code === "FSE-TRM-POWERCADVANCED-25ML" &&
      r.sale_date >= "2026-06-01" &&
      r.sale_date <= "2026-06-30",
  );
  console.log("parsed sales rows", rows.length);
  console.log("negative qty rows", neg.length);
  console.log(
    "TRM June sum",
    trm.reduce((s, r) => s + r.qty_sold, 0),
    "neg rows",
    trm.filter((r) => r.qty_sold < 0).length,
  );
  console.log("sample parsed", rows[0]);
  console.log("sample negative", neg[0]);
}

debug().catch(console.error);
