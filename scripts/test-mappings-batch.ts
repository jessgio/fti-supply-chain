import { importMappings } from "../src/lib/db/uploads";
import type { BundleComponent, MappingRow } from "../src/types/database";

/**
 * In-memory fake of the subset of supabase-js used by importMappings.
 * Verifies batching logic & counts network round-trips without touching a DB.
 */
function createFakeSupabase() {
  let nextId = 1;
  const tables: Record<string, Map<string, any>> = {
    upload_batches: new Map(),
    product_franchises: new Map(),
    skus: new Map(),
    bundle_components: new Map(),
  };
  const keyCol: Record<string, string> = {
    product_franchises: "slug",
    skus: "sku_code",
    bundle_components: "__pk",
    upload_batches: "id",
  };
  let requests = 0;

  function rows(table: string) {
    return [...tables[table].values()];
  }

  class Query {
    op: string | null = null;
    payload: any = null;
    conflict?: string;
    ignoreDup = false;
    _single: false | "single" | "maybe" = false;
    filters: [string, string, any][] = [];
    constructor(public table: string) {}

    insert(p: any) {
      this.op = "insert";
      this.payload = p;
      return this;
    }
    upsert(p: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      this.op = "upsert";
      this.payload = p;
      this.conflict = opts?.onConflict;
      this.ignoreDup = opts?.ignoreDuplicates ?? false;
      return this;
    }
    update(p: any) {
      this.op = "update";
      this.payload = p;
      return this;
    }
    select(_proj?: string) {
      if (this.op === null) this.op = "select";
      return this;
    }
    eq(col: string, val: any) {
      this.filters.push(["eq", col, val]);
      return this;
    }
    in(col: string, vals: any[]) {
      this.filters.push(["in", col, vals]);
      return this;
    }
    not(col: string, _op: string, val: any) {
      this.filters.push(["not", col, val]);
      return this;
    }
    maybeSingle() {
      this._single = "maybe";
      return this.exec();
    }
    single() {
      this._single = "single";
      return this.exec();
    }
    then(resolve: (v: any) => any, reject?: (e: any) => any) {
      return this.exec().then(resolve, reject);
    }

    private match(row: any) {
      return this.filters.every(([kind, col, val]) => {
        if (kind === "eq") return row[col] === val;
        if (kind === "in") return (val as any[]).includes(row[col]);
        if (kind === "not") return row[col] !== val;
        return true;
      });
    }

    async exec(): Promise<any> {
      requests += 1;
      const store = tables[this.table];
      const kc = keyCol[this.table];

      if (this.op === "insert" || this.op === "upsert") {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted: any[] = [];
        for (const raw of list) {
          const rec = { ...raw };
          if (this.table === "bundle_components") {
            rec.__pk = `${rec.bundle_sku_id}|${rec.component_sku_id}`;
          }
          const key = rec[kc] ?? String(nextId);
          const existing = store.get(key);
          if (existing && this.op === "upsert" && this.ignoreDup) {
            inserted.push(existing);
            continue;
          }
          if (existing && this.op === "upsert") {
            Object.assign(existing, rec);
            inserted.push(existing);
            continue;
          }
          if (!("id" in rec) && this.table !== "bundle_components") {
            rec.id = `id-${nextId++}`;
          }
          store.set(key, rec);
          inserted.push(rec);
        }
        const data = this._single ? inserted[0] : inserted;
        return { data, error: null };
      }

      if (this.op === "update") {
        for (const row of rows(this.table)) {
          if (this.match(row)) Object.assign(row, this.payload);
        }
        return { data: null, error: null };
      }

      // select
      const matched = rows(this.table).filter((r) => this.match(r));
      if (this._single === "maybe") return { data: matched[0] ?? null, error: null };
      if (this._single === "single") return { data: matched[0], error: null };
      return { data: matched, error: null };
    }
  }

  const client = {
    from(table: string) {
      return new Query(table);
    },
    async rpc(_fn: string) {
      requests += 1;
      return { data: null, error: null };
    },
  };

  return {
    client,
    tables,
    getRequests: () => requests,
    resetRequests: () => {
      requests = 0;
    },
  };
}

function assert(label: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log("ok", label);
}

async function main() {
  const fake = createFakeSupabase();

  // Build a realistic-sized mapping set: 600 single SKUs across 40 franchises,
  // plus 50 bundles with 3 components each (some components new).
  const mappings: MappingRow[] = [];
  for (let i = 0; i < 600; i++) {
    mappings.push({
      sku_code: `SKU-${i}`,
      franchise_name: `Franchise ${i % 40}`,
      sku_name: `Product ${i}`,
    });
  }
  const bundles: BundleComponent[] = [];
  for (let b = 0; b < 50; b++) {
    for (let c = 0; c < 3; c++) {
      // b*13+c spans 0..641: many are existing franchise singles (<600),
      // and SKU-600..641 are brand-new components not in the franchise sheet.
      bundles.push({
        bundle_sku_code: `BND-${b}`,
        component_sku_code: `SKU-${b * 13 + c}`,
        qty_per_bundle: c + 1,
      });
    }
  }

  fake.resetRequests();
  const result = await importMappings(
    fake.client as any,
    mappings,
    bundles,
    "sample-mappings.xlsx",
  );
  const requests = fake.getRequests();

  console.log("\nimportMappings result:", result);
  console.log(
    `Round-trips for ${mappings.length} mappings + ${bundles.length} bundle rows: ${requests}`,
  );

  // Correctness checks
  assert("franchises created", fake.tables.product_franchises.size === 40);
  assert(
    "single sku franchise resolved",
    fake.tables.skus.get("SKU-0")?.franchise_id != null &&
      fake.tables.skus.get("SKU-0")?.is_bundle === false,
  );
  assert(
    "single sku name from sheet",
    fake.tables.skus.get("SKU-5")?.name === "Product 5",
  );
  assert(
    "bundle parent is_bundle true, no franchise",
    fake.tables.skus.get("BND-0")?.is_bundle === true &&
      fake.tables.skus.get("BND-0")?.franchise_id == null,
  );
  assert(
    "new component inserted as single",
    fake.tables.skus.get("SKU-600")?.is_bundle === false &&
      fake.tables.skus.get("SKU-600")?.franchise_id == null,
  );
  assert(
    "component that is a franchise single keeps franchise",
    fake.tables.skus.get("SKU-13")?.franchise_id != null,
  );
  assert("bundle_components populated", fake.tables.bundle_components.size > 0);
  assert("result mappingCount", result.mappingCount === 600);

  // Speed proof: round-trips must scale with chunks, not per-row.
  // Old code did >= 2 round-trips per mapping (>=1200). New code is far fewer.
  assert(`batched round-trips (<60), got ${requests}`, requests < 60);

  console.log("\nAll batched mappings-import checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
