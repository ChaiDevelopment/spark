-- =============================================================================
-- SPARK 0001 — Foundation: schemas, shared helpers, admin roles, rate limiting
-- =============================================================================
-- Conventions
--   * Every user-facing table lives in `public` and has RLS enabled.
--   * Privileged helpers live in the `private` schema, which is NOT exposed by
--     the Supabase Data API. Helpers that RLS policies call are SECURITY DEFINER
--     with a pinned search_path.
--   * Supabase grants ALL on new public tables to anon/authenticated by default.
--     Every table below explicitly revokes that and re-grants the minimum.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Shared updated_at trigger ---------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "Today" for usage limits uses the primary market's timezone (WIB).
create or replace function private.app_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- =============================================================================
-- Administration: role assignments (cannot be written by clients)
-- =============================================================================
create table public.admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('moderator', 'admin')),
  granted_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger admin_users_updated_at before update on public.admin_users
  for each row execute function private.set_updated_at();

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

-- Role helpers. SECURITY DEFINER so they can read admin_users regardless of RLS.
create or replace function private.has_role(required text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
      and (a.role = 'admin' or (required = 'moderator' and a.role = 'moderator'))
  )
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role('moderator') $$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role('admin') $$;

revoke all on function private.has_role(text), private.is_staff(), private.is_admin() from public;
grant execute on function private.has_role(text), private.is_staff(), private.is_admin() to authenticated, service_role;

-- Users can see their own role row (to render the admin link); admins see all.
create policy "admin_users: self or admin can read"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Public RPC so the app can ask "am I staff?" without trusting the browser.
create or replace function public.my_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select role from public.admin_users where user_id = (select auth.uid()) $$;
revoke all on function public.my_staff_role() from public, anon;
grant execute on function public.my_staff_role() to authenticated;

-- =============================================================================
-- Admin audit log (append-only; written only by SECURITY DEFINER functions)
-- =============================================================================
create table public.admin_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid,                 -- no FK: logs survive account deletion
  action        text not null,
  target_type   text not null,
  target_id     uuid,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
create policy "audit: admins read"
  on public.admin_audit_logs for select to authenticated
  using ((select private.is_admin()));

create or replace function private.audit(
  p_action text, p_target_type text, p_target_id uuid, p_details jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function private.audit(text, text, uuid, jsonb) from public;

-- =============================================================================
-- Fixed-window rate limiter (DB-backed; no extra paid service needed)
-- =============================================================================
create table private.rate_limit_hits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, window_start)
);

create or replace function private.check_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limit_hits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke all on function private.check_rate_limit(text, integer, integer) from public;

-- Callable by signed-in users for server routes (e.g. photo upload URLs).
-- Only whitelisted actions with server-defined limits; the key is auth.uid().
create or replace function public.consume_rate_limit(p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_max integer;
  v_window integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  case p_action
    when 'photo_upload'   then v_max := 20; v_window := 3600;
    when 'photo_view'     then v_max := 600; v_window := 3600;
    when 'account_delete' then v_max := 5;  v_window := 3600;
    when 'profile_update' then v_max := 60; v_window := 3600;
    else raise exception 'unknown rate limit action' using errcode = '22023';
  end case;
  return private.check_rate_limit(p_action || ':' || v_uid::text, v_max, v_window);
end;
$$;
revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;

-- Periodic cleanup (call from a scheduled job / admin action).
create or replace function private.prune_rate_limits()
returns void language sql security definer set search_path = ''
as $$ delete from private.rate_limit_hits where window_start < now() - interval '2 days' $$;
