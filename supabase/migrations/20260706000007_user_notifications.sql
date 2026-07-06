-- In-app notifications for @mentions in status updates and replies.

create type public.user_notification_source as enum (
  'status_update',
  'status_update_reply'
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  source_type public.user_notification_source not null,
  source_id uuid not null,
  status_update_id uuid not null references public.status_updates (id) on delete cascade,
  body_preview text not null,
  po_id uuid references public.purchase_orders (id) on delete set null,
  po_number text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notifications_unique_mention unique (recipient_id, source_type, source_id)
);

create index user_notifications_recipient_created_idx
  on public.user_notifications (recipient_id, created_at desc);

create index user_notifications_recipient_unread_idx
  on public.user_notifications (recipient_id)
  where read_at is null;

alter table public.user_notifications enable row level security;

create policy "read own notifications" on public.user_notifications
  for select to authenticated
  using (auth.uid() = recipient_id);

create policy "update own notifications" on public.user_notifications
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);
