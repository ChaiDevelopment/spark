-- ---------------------------------------------------------------------------
-- Scheduled maintenance entry point.
--
-- private.* functions are not exposed through the Data API, so the daily
-- cleanup cron (/api/cron/cleanup, service-role client) calls this wrapper.
-- It is executable by service_role ONLY — never by anon or authenticated.
-- ---------------------------------------------------------------------------
create or replace function public.run_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.prune_rate_limits();
end;
$$;

revoke all on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;
