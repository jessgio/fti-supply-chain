-- Versioned supplier proforma invoice attachments on purchase orders.

create type public.po_document_type as enum (
  'proforma_invoice'
);

create table public.purchase_order_documents (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  document_type public.po_document_type not null default 'proforma_invoice',
  version_number integer not null check (version_number > 0),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (purchase_order_id, document_type, version_number)
);

create index purchase_order_documents_po_idx
  on public.purchase_order_documents (purchase_order_id, document_type, version_number desc);

comment on table public.purchase_order_documents is
  'Supplier document attachments for purchase orders (e.g. proforma invoices)';

alter table public.purchase_order_documents enable row level security;

create policy "authenticated read po documents"
  on public.purchase_order_documents for select
  to authenticated
  using (true);

create policy "writer write po documents"
  on public.purchase_order_documents for all
  to authenticated
  using (public.current_user_role() in ('admin', 'supply_chain'))
  with check (public.current_user_role() in ('admin', 'supply_chain'));
