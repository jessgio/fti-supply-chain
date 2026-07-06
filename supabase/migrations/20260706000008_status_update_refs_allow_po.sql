-- Allow purchase orders in status_update_refs for cross-PO references.

alter table public.status_update_refs
  drop constraint if exists status_update_refs_not_po;
