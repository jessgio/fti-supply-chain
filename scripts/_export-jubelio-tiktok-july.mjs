import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
function get(key) {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const sb = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
);

const { data: channels, error: chErr } = await sb
  .from("sales_channels")
  .select("id, name")
  .in("name", ["Shop | Tokopedia", "TOKOPEDIA"]);
if (chErr) throw chErr;
const channelIds = new Set(channels.map((c) => c.id));
const nameById = new Map(channels.map((c) => [c.id, c.name]));

const { data, error } = await sb.rpc("get_sop_monthly_actuals", {
  p_start: "2026-07-01",
  p_end: "2026-07-31",
});
if (error) throw error;

const { data: skus, error: skuErr } = await sb
  .from("skus")
  .select("id, sku_code");
if (skuErr) throw skuErr;
const codeById = new Map(skus.map((s) => [s.id, s.sku_code]));

const bySku = new Map();
const byChannel = new Map();
for (const r of data ?? []) {
  if (Number(r.sale_year) !== 2026 || Number(r.sale_month) !== 7) continue;
  if (!channelIds.has(r.channel_id)) continue;
  const sku = codeById.get(r.sku_id);
  if (!sku) continue;
  const cur = bySku.get(sku) ?? { sku, qty: 0, net: 0 };
  cur.qty += Number(r.qty);
  cur.net += Number(r.net_sales);
  bySku.set(sku, cur);
  const ch = nameById.get(r.channel_id) ?? "?";
  const chCur = byChannel.get(ch) ?? { qty: 0, net: 0 };
  chCur.qty += Number(r.qty);
  chCur.net += Number(r.net_sales);
  byChannel.set(ch, chCur);
}

const out = [...bySku.values()]
  .map((r) => ({
    sku: r.sku,
    qty: Math.round(r.qty * 10000) / 10000,
    net: Math.round(r.net * 100) / 100,
  }))
  .sort((a, b) => a.sku.localeCompare(b.sku));

const dest =
  "C:/Users/jessi/.cursor/projects/c-Users-jessi-Projects-fti-supply-chain/jubelio-tiktok-july.json";
fs.writeFileSync(dest, JSON.stringify(out));
console.log(
  "wrote",
  out.length,
  "skus",
  "qty",
  out.reduce((s, r) => s + r.qty, 0),
  "net",
  out.reduce((s, r) => s + r.net, 0),
);
console.log("by channel", Object.fromEntries(byChannel));
