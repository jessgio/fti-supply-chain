-- Shipment documentation checklist and versioned file uploads.

create type public.shipment_document_type as enum (
  'commercial_invoice',
  'packing_list',
  'bill_of_lading',
  'awb_label',
  'coo_form_fe',
  'pib',
  'sppb',
  'forwarder_invoice',
  'lartas'
);

create type public.shipment_document_version_status as enum ('draft', 'final');

create table public.shipment_required_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  document_type public.shipment_document_type not null,
  created_at timestamptz not null default now(),
  unique (shipment_id, document_type)
);

create index shipment_required_documents_shipment_idx
  on public.shipment_required_documents (shipment_id);

create table public.shipment_document_versions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  document_type public.shipment_document_type not null,
  version_number integer not null check (version_number > 0),
  status public.shipment_document_version_status not null default 'draft',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  uploaded_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (shipment_id, document_type, version_number)
);

create index shipment_document_versions_shipment_idx
  on public.shipment_document_versions (shipment_id);

create index shipment_document_versions_type_idx
  on public.shipment_document_versions (shipment_id, document_type);

alter table public.shipment_required_documents enable row level security;
alter table public.shipment_document_versions enable row level security;

create policy "Authenticated users can read shipment required documents"
  on public.shipment_required_documents for select
  to authenticated using (true);

create policy "Authenticated users can manage shipment required documents"
  on public.shipment_required_documents for all
  to authenticated using (true) with check (true);

create policy "Authenticated users can read shipment document versions"
  on public.shipment_document_versions for select
  to authenticated using (true);

create policy "Authenticated users can manage shipment document versions"
  on public.shipment_document_versions for all
  to authenticated using (true) with check (true);
