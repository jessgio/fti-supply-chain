-- Restrict new auth users to @fromthisisland.com and map Google profile names.

create or replace function public.hook_restrict_signup_to_fti_domain(event jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  email text;
  domain text;
begin
  email := lower(trim(event->'user'->>'email'));
  domain := split_part(coalesce(email, ''), '@', 2);

  if domain is distinct from 'fromthisisland.com' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Only @fromthisisland.com Google accounts can sign in.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute
  on function public.hook_restrict_signup_to_fti_domain(jsonb)
  to supabase_auth_admin;

grant usage on schema public to supabase_auth_admin;

revoke execute
  on function public.hook_restrict_signup_to_fti_domain(jsonb)
  from authenticated, anon, public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
