-- =============================================================================
-- SPARK 0009 — Moderation panel
--
--   * Suspensions with an end date, permanent bans, warnings
--   * Idempotent moderation: a report or photo can be actioned only once
--   * One transactional RPC that resolves a report (warn / suspend / ban /
--     remove photos), so a half-applied decision is impossible
--   * Staff-only read helpers: user summaries, reported messages only
--   * Audit log becomes append-only (no UPDATE / DELETE / TRUNCATE)
--   * Suspended and banned accounts: hidden from discovery and from
--     conversation lists, and cannot send messages
-- =============================================================================

-- ---------------------------------------------------------------- Account state
alter table public.profiles add column if not exists suspended_until timestamptz;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%account_status%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'suspended', 'banned', 'deactivated'));
alter table public.profiles
  add constraint profiles_suspension_until_check
  check (suspended_until is null or account_status = 'suspended');

-- Allowed moderation vocabulary grows by 'ban' and 'banned'.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.moderation_actions'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%approve_photo%'
  loop
    execute format('alter table public.moderation_actions drop constraint %I', c.conname);
  end loop;
  alter table public.moderation_actions add constraint moderation_actions_action_check check (action in
    ('approve_photo', 'reject_photo', 'dismiss', 'warn', 'suspend', 'unsuspend', 'resolve', 'note', 'ban'));
end;
$$;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.user_safety_events'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%unmatched%'
  loop
    execute format('alter table public.user_safety_events drop constraint %I', c.conname);
  end loop;
  alter table public.user_safety_events add constraint user_safety_events_event_type_check check (event_type in
    ('blocked', 'unblocked', 'reported', 'suspended', 'unsuspended', 'banned', 'photo_rejected',
     'unmatched', 'rate_limited', 'account_deleted'));
end;
$$;

-- ---------------------------------------------------------------- Audit log
-- Append-only: nobody (not even staff through the API) can change or erase history.
create or replace function private.forbid_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log is append-only' using errcode = '42501';
end;
$$;
create trigger admin_audit_logs_append_only
  before update or delete on public.admin_audit_logs
  for each row execute function private.forbid_audit_mutation();
create trigger admin_audit_logs_no_truncate
  before truncate on public.admin_audit_logs
  for each statement execute function private.forbid_audit_mutation();

-- ---------------------------------------------------------------- Photos
-- Review applies only to photos still waiting. A second moderator who opens the
-- same photo gets a clear "already reviewed" instead of silently overriding.
create or replace function public.admin_review_photo(p_photo uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ph public.profile_photos;
  v_queue uuid;
begin
  perform private.require_staff();
  select * into ph from public.profile_photos where id = p_photo for update;
  if not found then raise exception 'Photo not found' using errcode = 'P0002'; end if;
  if ph.status <> 'pending' then raise exception 'This photo was already reviewed' using errcode = 'P0003'; end if;
  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to reject a photo' using errcode = '22023';
  end if;
  update public.profile_photos
     set status = case when p_approve then 'approved' else 'rejected' end,
         rejection_reason = case when p_approve then null else left(btrim(p_reason), 300) end,
         position = case when p_approve then position end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_photo;
  update public.moderation_queue set status = 'resolved', resolved_at = now()
   where photo_id = p_photo and status in ('open', 'in_review')
  returning id into v_queue;
  insert into public.moderation_actions (queue_id, actor_id, subject_user_id, action, notes)
  values (v_queue, auth.uid(), ph.user_id, case when p_approve then 'approve_photo' else 'reject_photo' end, left(btrim(p_reason), 1000));
  perform private.audit(case when p_approve then 'photo.approve' else 'photo.reject' end, 'photo', p_photo,
                        jsonb_build_object('user_id', ph.user_id, 'reason', p_reason));
  if not p_approve then
    insert into public.user_safety_events (user_id, actor_id, event_type, details)
    values (ph.user_id, auth.uid(), 'photo_rejected', jsonb_build_object('photo_id', p_photo));
    perform private.notify(ph.user_id, 'moderation', 'A photo wasn''t approved',
      'Reason: ' || left(btrim(p_reason), 300), jsonb_build_object('photo_id', p_photo));
  end if;
end;
$$;

-- Remove a photo that is already live (or still pending) — used after reports.
create or replace function public.admin_remove_photo(p_photo uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ph public.profile_photos;
  v_queue uuid;
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Removed by our moderation team'), 300);
begin
  perform private.require_staff();
  select * into ph from public.profile_photos where id = p_photo for update;
  if not found then raise exception 'Photo not found' using errcode = 'P0002'; end if;
  if ph.status not in ('pending', 'approved') then raise exception 'This photo was already reviewed' using errcode = 'P0003'; end if;
  update public.profile_photos
     set status = 'rejected', rejection_reason = v_reason, position = null,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_photo;
  update public.moderation_queue set status = 'resolved', resolved_at = now()
   where photo_id = p_photo and status in ('open', 'in_review')
  returning id into v_queue;
  insert into public.moderation_actions (queue_id, actor_id, subject_user_id, action, notes)
  values (v_queue, auth.uid(), ph.user_id, 'reject_photo', v_reason);
  perform private.audit('photo.remove', 'photo', p_photo, jsonb_build_object('user_id', ph.user_id, 'reason', v_reason));
  insert into public.user_safety_events (user_id, actor_id, event_type, details)
  values (ph.user_id, auth.uid(), 'photo_rejected', jsonb_build_object('photo_id', p_photo));
  perform private.notify(ph.user_id, 'moderation', 'A photo was removed', v_reason, jsonb_build_object('photo_id', p_photo));
end;
$$;

-- ---------------------------------------------------------------- User moderation
create or replace function public.admin_moderate_user(
  p_user uuid, p_action text, p_reason text default null, p_days integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_until timestamptz;
begin
  perform private.require_staff();
  if p_user is null or p_user = auth.uid() then
    raise exception 'You cannot moderate your own account' using errcode = '22023';
  end if;
  if p_action not in ('warn', 'suspend', 'ban', 'unsuspend') then
    raise exception 'Invalid action' using errcode = '22023';
  end if;
  if exists (select 1 from public.admin_users where user_id = p_user) and not private.is_admin() then
    raise exception 'Only admins can moderate staff accounts' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  if p_action in ('warn', 'suspend', 'ban') and v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  if p_action = 'warn' then
    insert into public.moderation_actions (actor_id, subject_user_id, action, notes)
    values (auth.uid(), p_user, 'warn', left(v_reason, 1000));
    perform private.notify(p_user, 'moderation', 'A warning about your account', left(v_reason, 300), '{}'::jsonb);
    perform private.audit('user.warn', 'user', p_user, jsonb_build_object('reason', v_reason));
    return;
  end if;

  if p_action = 'unsuspend' then
    if p.account_status = 'active' then return; end if;          -- already restored
    update public.profiles set account_status = 'active', suspended_until = null, suspended_reason = null where id = p_user;
    insert into public.moderation_actions (actor_id, subject_user_id, action, notes)
    values (auth.uid(), p_user, 'unsuspend', left(v_reason, 1000));
    insert into public.user_safety_events (user_id, actor_id, event_type, details)
    values (p_user, auth.uid(), 'unsuspended', jsonb_build_object('reason', v_reason));
    perform private.audit('user.unsuspend', 'user', p_user, jsonb_build_object('reason', v_reason));
    perform private.notify(p_user, 'moderation', 'Your account has been restored', coalesce(v_reason, ''), '{}'::jsonb);
    return;
  end if;

  if p_action = 'ban' then
    if p.account_status = 'banned' then return; end if;          -- idempotent
    update public.profiles set account_status = 'banned', suspended_until = null,
                               suspended_reason = left(v_reason, 300) where id = p_user;
    insert into public.moderation_actions (actor_id, subject_user_id, action, notes)
    values (auth.uid(), p_user, 'ban', left(v_reason, 1000));
    insert into public.user_safety_events (user_id, actor_id, event_type, details)
    values (p_user, auth.uid(), 'banned', jsonb_build_object('reason', v_reason));
    perform private.audit('user.ban', 'user', p_user, jsonb_build_object('reason', v_reason));
    perform private.notify(p_user, 'moderation', 'Your account has been permanently banned',
      left(v_reason, 300), '{}'::jsonb);
    return;
  end if;

  -- suspend
  if p.account_status = 'banned' then raise exception 'This account is banned' using errcode = '22023'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Suspensions last between 1 and 365 days' using errcode = '22023';
  end if;
  v_until := now() + make_interval(days => p_days);
  update public.profiles set account_status = 'suspended', suspended_until = v_until,
                             suspended_reason = left(v_reason, 300) where id = p_user;
  insert into public.moderation_actions (actor_id, subject_user_id, action, notes)
  values (auth.uid(), p_user, 'suspend', left(v_reason, 1000));
  insert into public.user_safety_events (user_id, actor_id, event_type, details)
  values (p_user, auth.uid(), 'suspended', jsonb_build_object('reason', v_reason, 'days', p_days, 'until', v_until));
  perform private.audit('user.suspend', 'user', p_user, jsonb_build_object('reason', v_reason, 'days', p_days, 'until', v_until));
  perform private.notify(p_user, 'moderation', 'Your account has been suspended',
    left(v_reason, 200) || ' Suspended until ' || to_char(v_until at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI') || ' WIB.',
    '{}'::jsonb);
end;
$$;

-- Lift a suspension whose end date has passed. Users can lift their own; the
-- daily maintenance job lifts everyone's.
create or replace function public.lift_my_expired_suspension()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  update public.profiles set account_status = 'active', suspended_until = null, suspended_reason = null
   where id = v_me and account_status = 'suspended' and suspended_until < now();
  return found;
end;
$$;

-- ---------------------------------------------------------------- Reports
-- Resolve a report in ONE transaction. The row lock makes a second moderator
-- who acts on the same report fail with "already handled" instead of doubling
-- the sanction.
create or replace function public.admin_resolve_report(
  p_report uuid, p_outcome text, p_reason text default null,
  p_days integer default null, p_remove_photos boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.user_reports;
  ph record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_staff();
  if p_outcome not in ('dismiss', 'warn', 'suspend', 'ban') then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;
  if p_outcome = 'dismiss' and p_remove_photos then
    raise exception 'A dismissed report cannot remove photos' using errcode = '22023';
  end if;
  select * into r from public.user_reports where id = p_report for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if r.status not in ('open', 'in_review') then
    raise exception 'This report was already handled' using errcode = 'P0003';
  end if;

  if p_outcome = 'dismiss' then
    update public.user_reports set status = 'dismissed' where id = r.id;
    update public.moderation_queue set status = 'dismissed', assigned_to = auth.uid(), resolved_at = now()
     where report_id = r.id;
    insert into public.moderation_actions (queue_id, actor_id, subject_user_id, action, notes)
    select q.id, auth.uid(), r.reported_user_ref, 'dismiss', left(v_reason, 1000)
      from public.moderation_queue q where q.report_id = r.id;
  else
    if p_remove_photos then
      for ph in select id from public.profile_photos
                 where user_id = r.reported_user_ref and status in ('pending', 'approved') loop
        perform public.admin_remove_photo(ph.id, coalesce(v_reason, 'Removed after a report'));
      end loop;
    end if;
    perform public.admin_moderate_user(r.reported_user_ref, p_outcome, v_reason, p_days);
    update public.user_reports set status = 'actioned' where id = r.id;
    update public.moderation_queue set status = 'resolved', assigned_to = auth.uid(), resolved_at = now()
     where report_id = r.id;
    insert into public.moderation_actions (queue_id, actor_id, subject_user_id, action, notes)
    select q.id, auth.uid(), r.reported_user_ref, 'resolve', left(p_outcome || coalesce(': ' || v_reason, ''), 1000)
      from public.moderation_queue q where q.report_id = r.id;
  end if;

  perform private.audit('report.resolve', 'report', r.id, jsonb_build_object(
    'outcome', p_outcome, 'reported_user', r.reported_user_ref, 'days', p_days,
    'remove_photos', p_remove_photos, 'reason', v_reason));
end;
$$;

-- ---------------------------------------------------------------- Staff read helpers
-- Profile summaries for the queues and user pages. Never returns date of birth;
-- age only. Reporter identities are not exposed here.
create or replace function public.admin_profiles(p_ids uuid[])
returns table (
  id uuid, display_name text, email text, age integer, city text, region text,
  account_status text, suspended_until timestamptz, suspended_reason text,
  onboarded boolean, report_count integer, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_staff();
  return query
  select p.id, p.display_name, u.email::text, private.age_of(p.id), p.city, p.region,
         p.account_status::text, p.suspended_until, p.suspended_reason,
         p.onboarding_completed_at is not null,
         (select count(*)::integer from public.user_reports r where r.reported_user_ref = p.id),
         p.created_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.id = any (coalesce(p_ids, '{}'::uuid[]))
   limit 500;
end;
$$;

-- The content of a message is shown ONLY when a report points at it, and every
-- view is audited.
create or replace function public.admin_reported_message(p_message uuid)
returns table (message_id uuid, sender_id uuid, body text, sent_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_staff();
  if not exists (select 1 from public.user_reports r where r.context_type = 'message' and r.context_id = p_message) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  perform private.audit('message.view_reported', 'message', p_message, '{}'::jsonb);
  return query
  select m.id, m.sender_id, m.body, m.created_at from public.messages m where m.id = p_message;
end;
$$;

-- ---------------------------------------------------------------- Hide suspended / banned accounts from chat
create or replace function public.list_conversations()
returns table (
  conversation_id uuid, match_id uuid, other_user_id uuid, other_display_name text,
  other_photo_id uuid, status text, last_message_at timestamptz, last_message_preview text,
  last_sender_id uuid, unread_count integer, archived boolean, matched_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, m.id, o.id, o.display_name,
         (select ph.id from public.profile_photos ph where ph.user_id = o.id and ph.status = 'approved'
           order by ph.position nulls last, ph.created_at limit 1),
         c.status, c.last_message_at, c.last_message_preview,
         (select msg.sender_id from public.messages msg where msg.conversation_id = c.id
           order by msg.created_at desc, msg.id desc limit 1),
         (select count(*)::integer from public.messages msg
           where msg.conversation_id = c.id and msg.sender_id is distinct from cm.user_id
             and msg.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         cm.archived_at is not null,
         m.created_at
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  join public.matches m on m.id = c.match_id
  join public.profiles o on o.id = case when m.user_low = cm.user_id then m.user_high else m.user_low end
  left join public.message_read_receipts r on r.conversation_id = c.id and r.user_id = cm.user_id
  where cm.user_id = (select auth.uid()) and m.status = 'active'
    and private.is_eligible(o.id)            -- a suspended or banned match disappears
  order by coalesce(c.last_message_at, m.created_at) desc
$$;

create or replace function public.send_message(p_conversation uuid, p_body text, p_client_id uuid default null)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_body text;
  v_msg public.messages;
  v_other uuid;
  v_match public.matches;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = v_me) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if p_client_id is not null then
    select * into v_msg from public.messages where sender_id = v_me and client_id = p_client_id;
    if found then return v_msg; end if;
  end if;

  select m.* into v_match from public.conversations c join public.matches m on m.id = c.match_id
   where c.id = p_conversation and c.status = 'active';
  if not found or v_match.status <> 'active' then
    raise exception 'This conversation has ended' using errcode = 'P0004';
  end if;
  if (select account_status from public.profiles where id = v_me) <> 'active' then
    raise exception 'Your account cannot send messages right now' using errcode = 'P0001';
  end if;
  v_other := case when v_match.user_low = v_me then v_match.user_high else v_match.user_low end;
  if private.is_blocked_between(v_me, v_other) or not private.is_eligible(v_other) then
    raise exception 'This conversation has ended' using errcode = 'P0004';
  end if;

  v_body := btrim(regexp_replace(coalesce(p_body, ''), E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', '', 'g'));
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'Messages must be between 1 and 2000 characters' using errcode = '22023';
  end if;

  if not private.check_rate_limit('msg:' || v_me::text, 30, 60)
     or not private.check_rate_limit('msg_day:' || v_me::text, 1000, 86400) then
    raise exception 'You''re sending messages too quickly. Take a breath and try again shortly.' using errcode = 'P0005';
  end if;

  insert into public.messages (conversation_id, sender_id, body, client_id)
  values (p_conversation, v_me, v_body, p_client_id)
  returning * into v_msg;

  update public.conversations
     set last_message_at = v_msg.created_at, last_message_preview = left(v_body, 80)
   where id = p_conversation;
  update public.conversation_members set archived_at = null where conversation_id = p_conversation;
  insert into public.message_read_receipts (conversation_id, user_id, last_read_message_id, last_read_at)
  values (p_conversation, v_me, v_msg.id, v_msg.created_at)
  on conflict (conversation_id, user_id) do update
    set last_read_message_id = excluded.last_read_message_id, last_read_at = excluded.last_read_at;

  if not exists (select 1 from public.notifications n
                 where n.user_id = v_other and n.type = 'new_message' and n.read_at is null
                   and n.data ->> 'conversation_id' = p_conversation::text) then
    perform private.notify(v_other, 'new_message', 'New message',
      (select display_name from public.profiles where id = v_me) || ' sent you a message',
      jsonb_build_object('conversation_id', p_conversation));
  end if;
  return v_msg;
end;
$$;

-- ---------------------------------------------------------------- Maintenance
create or replace function public.run_maintenance()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.prune_rate_limits();
  update public.profiles set account_status = 'active', suspended_until = null, suspended_reason = null
   where account_status = 'suspended' and suspended_until < now();
end;
$$;

-- ---------------------------------------------------------------- Grants
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_remove_photo(uuid, text)', 'public.admin_moderate_user(uuid, text, text, integer)',
    'public.admin_resolve_report(uuid, text, text, integer, boolean)', 'public.admin_profiles(uuid[])',
    'public.admin_reported_message(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke all on function public.lift_my_expired_suspension() from public, anon;
grant execute on function public.lift_my_expired_suspension() to authenticated;
