-- Add delivery note entity types for status updates.

alter type public.status_update_entity_type add value if not exists 'delivery_note';
alter type public.status_update_entity_type add value if not exists 'extract_delivery_note';
