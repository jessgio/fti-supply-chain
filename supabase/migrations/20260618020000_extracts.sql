-- FTI Supply Chain: Extracts usage ledger
-- Tracks raw-material extract movements parsed from manufacturer screenshots.
-- Each screenshot row becomes a transaction; overlapping monthly uploads are
-- deduplicated/overwritten via a deterministic per-row signature.

create type public.extract_category as enum (
  'quality_control',  -- QAC
  'rnd',              -- RNI
  'production',       -- SC/HC Mixing
  'inbound_supplier', -- PT Inovasi Alam Nus...
  'destroy_defect',   -- Logistic (MS)
  'waste',            -- WH. RM. Not Match, SCM
  'uncategorized'
);

create table public.extracts (
  id uuid primary key default gen_random_uuid(),
  item_no text not null unique,
  description text,
  unit text not null default 'kg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Maps the raw FROM/TO text on a screenshot row to a normalized category.
-- A row is matched against the first rule (lowest priority value) whose pattern
-- appears (case-insensitively) inside the FROM/TO text. Editable so truncated
-- vendor names (e.g. "PT Inovasi Alam Nus...") can be tuned without a deploy.
create table public.extract_category_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  category public.extract_category not null,
  priority integer not null default 100,
  created_at timestamptz not null default now()
);

create table public.extract_transactions (
  id uuid primary key default gen_random_uuid(),
  extract_id uuid not null references public.extracts (id) on delete cascade,
  txn_date date not null,
  seq integer not null default 0,
  order_no text,
  tran_code text,
  from_to text,
  category public.extract_category not null default 'uncategorized',
  lot_no text,
  entered_qty numeric(18, 5),
  received numeric(18, 5) not null default 0,
  issued numeric(18, 5) not null default 0,
  balance numeric(18, 5),
  status text,
  remark text,
  signature text not null,
  source_filename text,
  source_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (extract_id, signature)
);

create index extract_transactions_extract_date_idx
  on public.extract_transactions (extract_id, txn_date, seq);
create index extract_transactions_category_idx
  on public.extract_transactions (category);

-- Seed default category mapping rules. Lower priority is evaluated first so the
-- more specific patterns win (e.g. "SC/HC" -> production before any "SC" rule).
insert into public.extract_category_rules (pattern, category, priority) values
  ('QAC', 'quality_control', 10),
  ('RNI', 'rnd', 10),
  ('SC/HC', 'production', 10),
  ('Mixing', 'production', 20),
  ('Inovasi Alam', 'inbound_supplier', 10),
  ('Logistic', 'destroy_defect', 10),
  ('WH. RM. Not Match', 'waste', 10),
  ('Not Match', 'waste', 20),
  ('SCM', 'waste', 30);

alter table public.extracts enable row level security;
alter table public.extract_category_rules enable row level security;
alter table public.extract_transactions enable row level security;

create policy "authenticated read extracts" on public.extracts
  for select to authenticated using (true);
create policy "authenticated write extracts" on public.extracts
  for all to authenticated using (true) with check (true);

create policy "authenticated read extract_category_rules" on public.extract_category_rules
  for select to authenticated using (true);
create policy "authenticated write extract_category_rules" on public.extract_category_rules
  for all to authenticated using (true) with check (true);

create policy "authenticated read extract_transactions" on public.extract_transactions
  for select to authenticated using (true);
create policy "authenticated write extract_transactions" on public.extract_transactions
  for all to authenticated using (true) with check (true);
