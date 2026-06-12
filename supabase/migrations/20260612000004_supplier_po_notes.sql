-- Supplier payment terms and beneficiary details for PO notes

alter table public.suppliers
  add column payment_terms text,
  add column lead_time_note text,
  add column delivery_time text,
  add column packaging_notes text,
  add column beneficiary_name text,
  add column beneficiary_account_number text,
  add column swift_code text,
  add column beneficiary_country text,
  add column beneficiary_address text,
  add column beneficiary_bank text,
  add column beneficiary_bank_address text,
  add column bank_code text,
  add column branch_code text;
