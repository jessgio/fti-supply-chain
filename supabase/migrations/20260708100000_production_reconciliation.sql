-- Production reconciliation: formulas, manufacturer production reports, ledger allocations.

create table public.product_extract_formulas (
  id uuid primary key default gen_random_uuid(),
  product_sku_id uuid not null references public.skus (id) on delete cascade,
  extract_id uuid not null references public.extracts (id) on delete restrict,
  extract_kg_per_unit numeric(18, 8) not null check (extract_kg_per_unit > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_extract_formulas_unique unique (product_sku_id, extract_id)
);

create index product_extract_formulas_extract_idx
  on public.product_extract_formulas (extract_id);

create table public.manufacturer_production_reports (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete restrict,
  po_number text not null,
  manufacturer text not null default 'Cosmax',
  invoice_number text,
  report_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manufacturer_production_reports_po_idx
  on public.manufacturer_production_reports (po_id);

create table public.manufacturer_production_report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.manufacturer_production_reports (id) on delete cascade,
  po_line_id uuid references public.purchase_order_lines (id) on delete set null,
  sku_id uuid not null references public.skus (id) on delete restrict,
  qty_produced numeric(14, 4) not null check (qty_produced > 0),
  uom text not null default 'pcs',
  created_at timestamptz not null default now()
);

create index manufacturer_production_report_lines_report_idx
  on public.manufacturer_production_report_lines (report_id);

create table public.production_extract_allocations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.manufacturer_production_reports (id) on delete cascade,
  extract_transaction_id uuid not null references public.extract_transactions (id) on delete restrict,
  allocated_kg numeric(18, 5) not null check (allocated_kg > 0),
  created_at timestamptz not null default now(),
  constraint production_extract_allocations_txn_unique unique (extract_transaction_id)
);

create index production_extract_allocations_report_idx
  on public.production_extract_allocations (report_id);

alter table public.product_extract_formulas enable row level security;
alter table public.manufacturer_production_reports enable row level security;
alter table public.manufacturer_production_report_lines enable row level security;
alter table public.production_extract_allocations enable row level security;

create policy "authenticated read product_extract_formulas"
  on public.product_extract_formulas for select to authenticated using (true);
create policy "authenticated write product_extract_formulas"
  on public.product_extract_formulas for all to authenticated using (true) with check (true);

create policy "authenticated read manufacturer_production_reports"
  on public.manufacturer_production_reports for select to authenticated using (true);
create policy "authenticated write manufacturer_production_reports"
  on public.manufacturer_production_reports for all to authenticated using (true) with check (true);

create policy "authenticated read manufacturer_production_report_lines"
  on public.manufacturer_production_report_lines for select to authenticated using (true);
create policy "authenticated write manufacturer_production_report_lines"
  on public.manufacturer_production_report_lines for all to authenticated using (true) with check (true);

create policy "authenticated read production_extract_allocations"
  on public.production_extract_allocations for select to authenticated using (true);
create policy "authenticated write production_extract_allocations"
  on public.production_extract_allocations for all to authenticated using (true) with check (true);
