-- Allow inbound receives to be marked short-closed when received qty < shipped
-- and the user opts to close the inbound without further receives.

alter type public.inbound_receive_status add value if not exists 'short_received';
