-- Link extract DN catalog rows to ledger extract records so both modules stay in sync.

alter table public.extract_codes
  add column if not exists extract_id uuid references public.extracts (id) on delete set null;

create index if not exists extract_codes_extract_id_idx
  on public.extract_codes (extract_id);
