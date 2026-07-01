-- Add in_production to the PO lifecycle between ordered and in_transit.
-- Requires procurement migration (20260606000015) to have been applied first.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'po_status'
  ) THEN
    RAISE EXCEPTION
      'Type public.po_status does not exist. Apply prior migrations first (e.g. supabase db push). The procurement migration 20260606000015 creates this type.';
  END IF;
END $$;

ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'in_production';
