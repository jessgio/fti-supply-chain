# FTI Supply Chain

Supply chain and sales intelligence platform for **From This Island**. Upload Excel exports, aggregate SKU and bundle sales into product franchises, track growth by channel and time period, and forecast inventory replenishment.

## Features

- **Excel ingestion** — sales, stock levels, and SKU/franchise/bundle mappings
- **Franchise aggregation** — single-SKU sales plus bundle decomposition into component SKUs
- **Growth analytics** — MoM and YoY by day, week, month, or year, filterable by channel
- **Demand forecasting** — EWMA-based reorder points, stockout dates, and restock quantities
- **AI insights** — optional OpenAI narrative on top of statistical forecasts

## Stack

- Next.js 16 (App Router)
- Supabase (Postgres + RLS)
- Recharts, xlsx, Vercel AI SDK

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Supabase**

   Copy `.env.example` to `.env.local` and add your project URL, anon key, and **service role key** (Settings → API in Supabase). The service role key is used only by server API routes for uploads and analytics.

3. **Run migrations**

   Link your Supabase project and apply the schema:

   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```

   Or paste `supabase/migrations/20260606000001_initial_schema.sql` into the Supabase SQL editor.

4. **Generate sample Excel files** (optional)

   ```bash
   npm run samples
   ```

   Upload franchise/bundle mappings, then `samples/FTI Sales.xlsx`, then `samples/FTI Stock.xlsx`.

5. **Start the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Recommended data flow

1. Upload **Franchise & bundle mappings** (`/dashboard/uploads`)
2. Upload **Sales transactions** (last 3 calendar months only; older data is preserved and overlapping dates are replaced)
3. Upload **Stock levels**
4. Review **Sales Growth** and **Inventory & Forecast** dashboards

## Excel column reference

### Sales (WMS export — `FTI Sales.xlsx`)

Sheet `Data1`. `FAKTUR` rows are imported; `CANCELED` orders are excluded.

Re-upload only the **last 3 calendar months** (current month plus the two prior). Rows older than that window are ignored. Existing records for the same date range are removed before import so duplicates are replaced; sales before the window are kept.

| WMS column | Maps to |
|------------|---------|
| Tanggal | sale_date |
| Channel | channel |
| SKU | sku_code |
| QTY | qty_sold |
| Harga | retail_price (RSP) — stored on SKU for bundle net-sales split |
| Nett Sales | net_sales |

**Bundle net sales split:** each component receives  
`bundle_nett_sales × (component_Harga × qty_per_bundle) / Σ(component_Harga × qty_per_bundle)`.  
Falls back to qty-only split if component RSP is missing.

### Stock (WMS export — `FTI Stock.xlsx`)

Sheet `Data1`. Snapshot date is set to the upload day (the WMS file has no date column).

| WMS column | Maps to |
|------------|---------|
| SKU | sku_code (rows with `-` are skipped) |
| Lokasi | location (warehouse) |
| Tersedia | qty_on_hand (available units) |
| Archive/Not Archive | Rows marked `Archive` are skipped |

A simplified format is also supported: `sku_code`, `location`, `qty_on_hand`, `as_of_date`.

### Mappings (sheet: Franchises)

Single SKUs only — franchises aggregate standalone sales plus units derived from bundle sales.

| Column | Notes |
|--------|-------|
| sku_code | Required — component / single SKU |
| franchise_name | Required |
| sku_name | Optional display name |

### Bundle breakdown (sheet: Bundles)

| Column | Notes |
|--------|-------|
| bundle_sku_code | Parent bundle SKU |
| component_sku_code | Component SKU |
| qty_per_bundle | Units of component per bundle sold |

## Deploy

Deploy to Vercel and set the same environment variables. Run Supabase migrations against your production database before first use.
