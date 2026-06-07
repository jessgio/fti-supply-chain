-- FTI Supply Chain: authentication profiles and role-based access
-- Adds a profile per auth user with a department role, and tightens write
-- access on operational tables to supply chain / admin roles.

create type public.user_role as enum (
  'admin',
  'supply_chain',
  'sales_marketing',
  'viewer'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Resolve the calling user's role (security definer so policies can call it
-- without recursive RLS on profiles).
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Auto-provision a profile when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tighten writes: only supply_chain / admin may mutate operational data.
-- Reads remain open to any authenticated user. The service-role key used by
-- upload/background jobs bypasses RLS and is unaffected.
do $$
declare
  t text;
  write_tables text[] := array[
    'product_franchises',
    'sales_channels',
    'skus',
    'bundle_components',
    'upload_batches',
    'sales_records',
    'stock_levels',
    'suppliers',
    'purchase_orders',
    'purchase_order_lines',
    'po_receipts'
  ];
begin
  foreach t in array write_tables loop
    execute format('drop policy if exists "authenticated write %s" on public.%I', t, t);
    execute format('drop policy if exists "writer write %s" on public.%I', t, t);
    execute format(
      'create policy "writer write %s" on public.%I for all to authenticated '
      || 'using (public.current_user_role() in (''admin'', ''supply_chain'')) '
      || 'with check (public.current_user_role() in (''admin'', ''supply_chain''))',
      t, t
    );
  end loop;
end $$;
