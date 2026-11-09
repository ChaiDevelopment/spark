-- =============================================================================
-- SPARK 0006 — Visibility rules, discovery, matching, chat, safety, admin RPCs
-- =============================================================================
-- Every public function here is SECURITY DEFINER, derives the caller from
-- auth.uid() (never from an argument), pins search_path = '' and is granted to
-- `authenticated` only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Eligibility & preference helpers
-- ---------------------------------------------------------------------------
create or replace function private.is_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = p_user and account_status = 'active' and onboarding_completed_at is not null)
$$;

create or replace function private.is_discoverable(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.account_status = 'active' and p.is_visible
      and p.onboarding_completed_at is not null
      and exists (select 1 from public.profile_photos ph where ph.user_id = p.id and ph.status = 'approved')
  )
$$;

create or replace function private.location_match(
  p_scope text, a_country text, a_region text, a_city text, b_country text, b_region text, b_city text
) returns boolean language sql immutable set search_path = '' as $$
  select case p_scope
    when 'anywhere' then true
    when 'country'  then a_country = b_country
    when 'region'   then a_country = b_country and a_region is not null and a_region = b_region
    when 'city'     then a_country = b_country and a_city is not null and a_city = b_city
    else false
  end
$$;

-- Does `viewer` want to see `target` (gender, age range, location scope)?
create or replace function private.wants(p_viewer uuid, p_target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_preferences vp
    join public.profiles v on v.id = vp.user_id
    join public.profiles t on t.id = p_target
    where vp.user_id = p_viewer
      and t.gender = any (vp.interested_in)
      and private.age_of(p_target) between vp.min_age and vp.max_age
      and private.location_match(vp.location_scope, v.country_code, v.region_key, v.city_key,
                                 t.country_code, t.region_key, t.city_key)
  )
$$;

create or replace function private.mutually_compatible(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.wants(a, b) and private.wants(b, a)
$$;

-- Who may read whose profile row.
create or replace function private.can_view_profile(p_target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.uid()) is null then false
    when p_target = (select auth.uid()) then true
    when private.is_staff() then true
    when private.is_blocked_between((select auth.uid()), p_target) then false
    when private.have_active_match((select auth.uid()), p_target) then true
    -- Someone who liked me (only surfaced via get_received_likes / premium)
    when exists (select 1 from public.likes l where l.liker_id = p_target and l.likee_id = (select auth.uid()))
         and private.is_eligible(p_target) then true
    else private.is_eligible((select auth.uid()))
         and private.is_discoverable(p_target)
         and private.mutually_compatible((select auth.uid()), p_target)
  end
$$;

revoke all on function private.is_eligible(uuid), private.is_discoverable(uuid), private.wants(uuid, uuid),
  private.mutually_compatible(uuid, uuid), private.can_view_profile(uuid),
  private.location_match(text, text, text, text, text, text, text) from public;
grant execute on function private.is_eligible(uuid), private.is_discoverable(uuid), private.wants(uuid, uuid),
  private.mutually_compatible(uuid, uuid), private.can_view_profile(uuid),
  private.location_match(text, text, text, text, text, text, text) to authenticated, service_role;

-- Cross-user read policies ------------------------------------------------------
create policy "profiles: permitted viewers read" on public.profiles for select to authenticated
  using (private.can_view_profile(id));
create policy "photos: approved photos of viewable profiles" on public.profile_photos for select to authenticated
  using (status = 'approved' and private.can_view_profile(user_id));
create policy "user_interests: viewable profiles" on public.user_interests for select to authenticated
  using (private.can_view_profile(user_id));
create policy "verification: viewable profiles" on public.user_verification for select to authenticated
  using (private.can_view_profile(user_id));

-- ---------------------------------------------------------------------------
-- Profile completion (calculated, never client-written)
-- ---------------------------------------------------------------------------
create or replace function private.compute_completion(p public.profiles)
returns smallint language sql stable security definer set search_path = '' as $$
  select least(100, (
      (case when char_length(p.display_name) >= 2 then 10 else 0 end)
    + (case when p.gender is not null then 10 else 0 end)
    + (case when exists (select 1 from public.profile_private pp where pp.user_id = p.id) then 10 else 0 end)
    + (case when p.city is not null then 10 else 0 end)
    + (case when char_length(p.bio) >= 20 then 10 else 0 end)
    + (case when p.relationship_goal is not null then 10 else 0 end)
    + (case when (select count(*) from public.profile_photos ph
                  where ph.user_id = p.id and ph.status in ('pending', 'approved')) >= 1 then 15 else 0 end)
    + (case when (select count(*) from public.profile_photos ph
                  where ph.user_id = p.id and ph.status in ('pending', 'approved')) >= 3 then 5 else 0 end)
    + (case when (select count(*) from public.user_interests ui where ui.user_id = p.id) >= 3 then 10 else 0 end)
    + (case when (select count(*) from public.chemistry_answers ca
                  join public.chemistry_questions q on q.id = ca.question_id and q.is_active
                  where ca.user_id = p.id) >= 30 then 10 else 0 end)
  ))::smallint
$$;

create or replace function private.profiles_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.completion_percent := private.compute_completion(new);
  return new;
end;
$$;
create trigger profiles_completion before update on public.profiles
  for each row execute function private.profiles_before_update();

create or replace function private.touch_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(
    case when tg_op = 'DELETE' then null else (to_jsonb(new) ->> 'user_id')::uuid end,
    (to_jsonb(old) ->> 'user_id')::uuid);
begin
  update public.profiles set completion_percent = completion_percent where id = v_user;
  return null;
end;
$$;
create trigger profile_photos_completion after insert or update of status or delete on public.profile_photos
  for each row execute function private.touch_completion();
create trigger user_interests_completion after insert or delete on public.user_interests
  for each row execute function private.touch_completion();
create trigger profile_private_completion after insert or update on public.profile_private
  for each row execute function private.touch_completion();
create trigger chemistry_answers_completion after insert or delete on public.chemistry_answers
  for each row execute function private.touch_completion();

-- ---------------------------------------------------------------------------
-- New account bootstrap (fires on Supabase Auth sign-up)
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name',
                                new.raw_user_meta_data ->> 'full_name',
                                new.raw_user_meta_data ->> 'name', ''), 40));
  insert into public.user_preferences (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  insert into public.user_verification (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Onboarding RPCs
-- ---------------------------------------------------------------------------
create or replace function public.set_date_of_birth(p_dob date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profile_private where user_id = v_me) then
    raise exception 'Date of birth is already set. Contact support to correct it.' using errcode = 'P0001';
  end if;
  insert into public.profile_private (user_id, date_of_birth) values (v_me, p_dob);
end;
$$;

create or replace function public.complete_onboarding()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  p public.profiles;
  v_missing text[] := '{}';
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into p from public.profiles where id = v_me;
  if char_length(btrim(p.display_name)) < 2 then v_missing := v_missing || 'display_name'; end if;
  if p.gender is null then v_missing := v_missing || 'gender'; end if;
  if p.city is null then v_missing := v_missing || 'city'; end if;
  if not exists (select 1 from public.profile_private where user_id = v_me) then v_missing := v_missing || 'date_of_birth'; end if;
  if (select cardinality(interested_in) from public.user_preferences where user_id = v_me) = 0 then
    v_missing := v_missing || 'interested_in';
  end if;
  if (select count(*) from public.user_interests where user_id = v_me) < 3 then v_missing := v_missing || 'interests'; end if;
  if not exists (select 1 from public.profile_photos where user_id = v_me and status in ('pending', 'approved')) then
    v_missing := v_missing || 'photos';
  end if;
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'missing', to_jsonb(v_missing));
  end if;
  update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = v_me;
  return jsonb_build_object('ok', true, 'missing', '[]'::jsonb);
end;
$$;

create or replace function public.touch_last_active()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_active_at = now()
  where id = (select auth.uid()) and last_active_at < now() - interval '5 minutes';
$$;

create or replace function public.reorder_photos(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_live integer;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select count(*) into v_live from public.profile_photos
   where user_id = v_me and status in ('pending', 'approved');
  if cardinality(p_ids) <> v_live or (select count(distinct x) from unnest(p_ids) x) <> v_live
     or exists (select 1 from unnest(p_ids) x
                where not exists (select 1 from public.profile_photos ph
                                  where ph.id = x and ph.user_id = v_me and ph.status in ('pending', 'approved'))) then
    raise exception 'Photo order must include each of your photos exactly once' using errcode = '22023';
  end if;
  update public.profile_photos ph set position = (o.ord - 1)::smallint
  from unnest(p_ids) with ordinality as o(id, ord)
  where ph.id = o.id and ph.user_id = v_me;
end;
$$;

-- ---------------------------------------------------------------------------
-- Discovery
-- ---------------------------------------------------------------------------
create or replace function public.get_discovery_candidates(p_limit integer default 20)
returns table (
  id uuid, display_name text, pronouns text, gender text, age integer, city text, region text,
  bio text, relationship_goal text, drinking text, smoking text, exercise text, communication_style text,
  is_verified boolean, shared_interests integer, last_active_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not private.is_eligible(v_me) then return; end if;
  return query
  with me as (
    select p.id, p.gender, p.country_code, p.region_key, p.city_key,
           up.interested_in, up.min_age, up.max_age, up.location_scope, private.age_of(p.id) as age
    from public.profiles p join public.user_preferences up on up.user_id = p.id
    where p.id = v_me
  )
  select t.id, t.display_name, t.pronouns,
         case when t.show_gender then t.gender end,
         a.age, t.city, t.region, t.bio, t.relationship_goal, t.drinking, t.smoking, t.exercise,
         t.communication_style,
         coalesce(uv.status = 'verified', false),
         (select count(*)::integer from public.user_interests ui
           where ui.user_id = t.id
             and ui.interest_id in (select mi.interest_id from public.user_interests mi where mi.user_id = v_me)),
         t.last_active_at
  from me
  join public.profiles t on t.id <> me.id
  join public.user_preferences tp on tp.user_id = t.id
  join public.profile_private tpp on tpp.user_id = t.id
  left join public.user_verification uv on uv.user_id = t.id
  cross join lateral (select extract(year from age(private.app_today(), tpp.date_of_birth))::integer as age) a
  where t.account_status = 'active' and t.is_visible and t.onboarding_completed_at is not null
    and exists (select 1 from public.profile_photos ph where ph.user_id = t.id and ph.status = 'approved')
    and t.gender = any (me.interested_in) and me.gender = any (tp.interested_in)
    and a.age between me.min_age and me.max_age
    and me.age between tp.min_age and tp.max_age
    and private.location_match(me.location_scope, me.country_code, me.region_key, me.city_key,
                               t.country_code, t.region_key, t.city_key)
    and private.location_match(tp.location_scope, t.country_code, t.region_key, t.city_key,
                               me.country_code, me.region_key, me.city_key)
    and not exists (select 1 from public.likes l where l.liker_id = me.id and l.likee_id = t.id)
    and not exists (select 1 from public.passes ps where ps.passer_id = me.id and ps.passee_id = t.id)
    and not exists (select 1 from public.user_blocks b
                    where (b.blocker_id = me.id and b.blocked_id = t.id) or (b.blocker_id = t.id and b.blocked_id = me.id))
    and not exists (select 1 from public.matches m where m.user_low = least(me.id, t.id) and m.user_high = greatest(me.id, t.id))
  order by (t.last_active_at > now() - interval '14 days') desc, 15 desc, t.last_active_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- Single profile card for the details page (age only, never date of birth).
create or replace function public.get_profile_card(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  t public.profiles;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not private.can_view_profile(p_user) then return null; end if;
  select * into t from public.profiles where id = p_user;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'display_name', t.display_name, 'pronouns', t.pronouns,
    'gender', case when t.show_gender or t.id = v_me then t.gender end,
    'age', private.age_of(t.id), 'city', t.city, 'region', t.region, 'bio', t.bio,
    'relationship_goal', t.relationship_goal, 'drinking', t.drinking, 'smoking', t.smoking,
    'exercise', t.exercise, 'communication_style', t.communication_style,
    'is_verified', coalesce((select status = 'verified' from public.user_verification where user_id = t.id), false),
    'interests', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'emoji', i.emoji,
                                  'shared', exists (select 1 from public.user_interests mi where mi.user_id = v_me and mi.interest_id = i.id))
                                  order by i.label)
                           from public.user_interests ui join public.interests i on i.id = ui.interest_id
                           where ui.user_id = t.id), '[]'::jsonb),
    'photo_ids', coalesce((select jsonb_agg(ph.id order by ph.position nulls last, ph.created_at)
                           from public.profile_photos ph
                           where ph.user_id = t.id
                             and (ph.status = 'approved' or (t.id = v_me and ph.status = 'pending'))), '[]'::jsonb),
    'match_id', (select m.id from public.matches m
                 where m.user_low = least(v_me, t.id) and m.user_high = greatest(v_me, t.id) and m.status = 'active'),
    'conversation_id', (select c.id from public.matches m join public.conversations c on c.match_id = m.id
                        where m.user_low = least(v_me, t.id) and m.user_high = greatest(v_me, t.id) and m.status = 'active'),
    'liked_by_me', exists (select 1 from public.likes l where l.liker_id = v_me and l.likee_id = t.id)
  );
end;
$$;

create or replace function public.get_usage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  u public.daily_usage_limits;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into u from public.daily_usage_limits where user_id = v_me and usage_date = private.app_today();
  return jsonb_build_object(
    'likes_used', coalesce(u.likes_used, 0),
    'likes_limit', (private.entitlement(v_me, 'daily_likes', '25'::jsonb))::integer,
    'super_likes_used', coalesce(u.super_likes_used, 0),
    'super_likes_limit', (private.entitlement(v_me, 'daily_super_likes', '1'::jsonb))::integer,
    'see_likes', (private.entitlement(v_me, 'see_likes', 'false'::jsonb))::boolean
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Likes, passes, matching (atomic + idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.like_user(p_target uuid, p_super boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_already boolean;
  v_usage public.daily_usage_limits;
  v_limit integer;
  v_match public.matches;
  v_conversation uuid;
  v_new_match boolean := false;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_target is null or p_target = v_me then
    raise exception 'You cannot like yourself' using errcode = '22023';
  end if;
  v_low := least(v_me, p_target);
  v_high := greatest(v_me, p_target);

  -- Serialize concurrent likes for this pair so simultaneous mutual likes
  -- always produce exactly one match.
  perform pg_advisory_xact_lock(hashtextextended(v_low::text || ':' || v_high::text, 42));

  if not private.is_eligible(v_me) then
    raise exception 'Finish setting up your profile before liking people' using errcode = 'P0001';
  end if;

  v_already := exists (select 1 from public.likes where liker_id = v_me and likee_id = p_target);

  if not v_already then
    if not private.is_discoverable(p_target)
       or private.is_blocked_between(v_me, p_target)
       or not private.mutually_compatible(v_me, p_target)
       or exists (select 1 from public.matches where user_low = v_low and user_high = v_high) then
      raise exception 'This profile is no longer available' using errcode = 'P0002';
    end if;

    insert into public.daily_usage_limits (user_id, usage_date) values (v_me, private.app_today())
    on conflict do nothing;
    select * into v_usage from public.daily_usage_limits
     where user_id = v_me and usage_date = private.app_today() for update;

    if p_super then
      v_limit := (private.entitlement(v_me, 'daily_super_likes', '1'::jsonb))::integer;
      if v_usage.super_likes_used >= v_limit then
        raise exception 'You''ve used today''s Super Like. It resets tomorrow.' using errcode = 'P0003';
      end if;
      update public.daily_usage_limits set super_likes_used = super_likes_used + 1
       where user_id = v_me and usage_date = v_usage.usage_date;
    else
      v_limit := (private.entitlement(v_me, 'daily_likes', '25'::jsonb))::integer;
      if v_usage.likes_used >= v_limit then
        raise exception 'You''ve reached today''s like limit. It resets tomorrow.' using errcode = 'P0003';
      end if;
      update public.daily_usage_limits set likes_used = likes_used + 1
       where user_id = v_me and usage_date = v_usage.usage_date;
    end if;

    insert into public.likes (liker_id, likee_id, is_super) values (v_me, p_target, p_super);
    insert into public.discovery_events (user_id, target_id, event_type)
    values (v_me, p_target, case when p_super then 'super_like' else 'like' end);
  end if;

  -- Mutual?
  if exists (select 1 from public.likes where liker_id = p_target and likee_id = v_me)
     and not private.is_blocked_between(v_me, p_target)
     and private.is_eligible(p_target) then
    insert into public.matches (user_low, user_high) values (v_low, v_high)
    on conflict (user_low, user_high) do nothing
    returning * into v_match;

    if v_match.id is not null then
      v_new_match := true;
      insert into public.match_members (match_id, user_id) values (v_match.id, v_me), (v_match.id, p_target);
      insert into public.conversations (match_id) values (v_match.id) returning id into v_conversation;
      insert into public.conversation_members (conversation_id, user_id)
      values (v_conversation, v_me), (v_conversation, p_target);
      insert into public.discovery_events (user_id, target_id, event_type)
      values (v_me, p_target, 'match'), (p_target, v_me, 'match');
      perform private.notify(v_me, 'new_match', 'It''s a spark! ✨', 'You have a new match. Say hi!',
        jsonb_build_object('match_id', v_match.id, 'conversation_id', v_conversation, 'user_id', p_target));
      perform private.notify(p_target, 'new_match', 'It''s a spark! ✨', 'You have a new match. Say hi!',
        jsonb_build_object('match_id', v_match.id, 'conversation_id', v_conversation, 'user_id', v_me));
    else
      select * into v_match from public.matches where user_low = v_low and user_high = v_high;
      if v_match.status = 'active' then
        select id into v_conversation from public.conversations where match_id = v_match.id;
      else
        v_match := null;
      end if;
    end if;
  elsif not v_already then
    perform private.notify(p_target, 'new_like',
      case when p_super then 'Someone super liked you 🌟' else 'Someone likes you 💛' end,
      'Keep discovering to find out who.', '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'liked', true,
    'already_liked', v_already,
    'matched', v_match.id is not null,
    'new_match', v_new_match,
    'match_id', v_match.id,
    'conversation_id', v_conversation
  );
end;
$$;

create or replace function public.pass_user(p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_target is null or p_target = v_me then raise exception 'Invalid profile' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'This profile is no longer available' using errcode = 'P0002';
  end if;
  insert into public.passes (passer_id, passee_id) values (v_me, p_target) on conflict do nothing;
  if found then
    insert into public.discovery_events (user_id, target_id, event_type) values (v_me, p_target, 'pass');
  end if;
  return jsonb_build_object('passed', true);
end;
$$;

-- Likes received that have not (yet) become matches. Identities are a premium
-- entitlement; free users get the count only.
create or replace function public.get_received_likes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_entitled boolean;
  v_count integer;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  v_entitled := (private.entitlement(v_me, 'see_likes', 'false'::jsonb))::boolean;
  select count(*) into v_count
  from public.likes l
  where l.likee_id = v_me
    and private.is_eligible(l.liker_id)
    and not private.is_blocked_between(v_me, l.liker_id)
    and not exists (select 1 from public.matches m
                    where m.user_low = least(v_me, l.liker_id) and m.user_high = greatest(v_me, l.liker_id))
    and not exists (select 1 from public.passes p where p.passer_id = v_me and p.passee_id = l.liker_id);
  if not v_entitled then
    return jsonb_build_object('entitled', false, 'count', v_count, 'likes', '[]'::jsonb);
  end if;
  return jsonb_build_object('entitled', true, 'count', v_count, 'likes', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', l.liker_id, 'display_name', p.display_name,
                                        'age', private.age_of(l.liker_id), 'city', p.city,
                                        'is_super', l.is_super, 'liked_at', l.created_at) order by l.created_at desc)
    from public.likes l join public.profiles p on p.id = l.liker_id
    where l.likee_id = v_me
      and private.is_eligible(l.liker_id)
      and not private.is_blocked_between(v_me, l.liker_id)
      and not exists (select 1 from public.matches m
                      where m.user_low = least(v_me, l.liker_id) and m.user_high = greatest(v_me, l.liker_id))
      and not exists (select 1 from public.passes ps where ps.passer_id = v_me and ps.passee_id = l.liker_id)
  ), '[]'::jsonb));
end;
$$;

create or replace function public.get_discovery_history(p_limit integer default 50)
returns table (target_id uuid, display_name text, event_type text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.target_id, p.display_name, e.event_type, e.created_at
  from public.discovery_events e
  join public.profiles p on p.id = e.target_id
  where e.user_id = (select auth.uid())
    and e.event_type in ('like', 'super_like', 'pass', 'match')
    and not private.is_blocked_between((select auth.uid()), e.target_id)
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.unmatch(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  m public.matches;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into m from public.matches where id = p_match for update;
  if not found or v_me not in (m.user_low, m.user_high) then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if m.status <> 'active' then return; end if;
  update public.matches set status = 'unmatched', ended_by = v_me, ended_at = now() where id = p_match;
  update public.conversations set status = 'closed' where match_id = p_match;
  insert into public.user_safety_events (user_id, actor_id, event_type, details)
  values (case when m.user_low = v_me then m.user_high else m.user_low end, v_me, 'unmatched',
          jsonb_build_object('match_id', p_match));
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
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
  if private.is_blocked_between(v_me, v_other) then
    raise exception 'This conversation has ended' using errcode = 'P0004';
  end if;

  -- Strip control characters (keep \n and \t), trim, bound length.
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

  -- One unread "new message" notification per conversation at a time.
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

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_last public.messages;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = v_me) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  select * into v_last from public.messages where conversation_id = p_conversation
   order by created_at desc, id desc limit 1;
  insert into public.message_read_receipts (conversation_id, user_id, last_read_message_id, last_read_at)
  values (p_conversation, v_me, v_last.id, now())
  on conflict (conversation_id, user_id) do update
    set last_read_message_id = excluded.last_read_message_id, last_read_at = excluded.last_read_at;
  update public.notifications set read_at = now()
   where user_id = v_me and type = 'new_message' and read_at is null
     and data ->> 'conversation_id' = p_conversation::text;
end;
$$;

create or replace function public.set_conversation_archived(p_conversation uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_members
     set archived_at = case when p_archived then now() end
   where conversation_id = p_conversation and user_id = auth.uid();
  if not found then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
end;
$$;

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
  order by coalesce(c.last_message_at, m.created_at) desc
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids))
$$;

-- ---------------------------------------------------------------------------
-- Safety: block, unblock, report
-- ---------------------------------------------------------------------------
create or replace function public.block_user(p_target uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_target is null or p_target = v_me then raise exception 'Invalid user' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if not private.check_rate_limit('block:' || v_me::text, 50, 86400) then
    raise exception 'Too many requests. Try again later.' using errcode = 'P0005';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id, reason)
  values (v_me, p_target, left(p_reason, 300))
  on conflict do nothing;
  update public.matches set status = 'blocked', ended_by = v_me, ended_at = now()
   where user_low = least(v_me, p_target) and user_high = greatest(v_me, p_target) and status = 'active';
  update public.conversations c set status = 'closed'
    from public.matches m
   where c.match_id = m.id and m.user_low = least(v_me, p_target) and m.user_high = greatest(v_me, p_target);
  insert into public.user_safety_events (user_id, actor_id, event_type) values (p_target, v_me, 'blocked');
end;
$$;

create or replace function public.unblock_user(p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  delete from public.user_blocks where blocker_id = v_me and blocked_id = p_target;
  if found then
    insert into public.user_safety_events (user_id, actor_id, event_type) values (p_target, v_me, 'unblocked');
  end if;
end;
$$;

create or replace function public.list_blocked_users()
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.user_blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
$$;

create or replace function public.report_user(
  p_target uuid, p_category text, p_details text default '',
  p_context_type text default 'profile', p_context_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_report uuid;
  v_priority smallint;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_target is null or p_target = v_me then raise exception 'Invalid user' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if not private.check_rate_limit('report:' || v_me::text, 10, 86400) then
    raise exception 'You''ve sent a lot of reports today. Our team is reviewing them.' using errcode = 'P0005';
  end if;
  -- Message reports must reference a message the reporter can see, sent by the target.
  if p_context_type = 'message' and not exists (
      select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = v_me
      where m.id = p_context_id and m.sender_id = p_target) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;

  insert into public.user_reports (reporter_id, reported_user_id, reported_user_ref, category, details, context_type, context_id)
  values (v_me, p_target, p_target, p_category, left(coalesce(p_details, ''), 1000), coalesce(p_context_type, 'profile'), p_context_id)
  returning id into v_report;

  v_priority := case when p_category in ('underage', 'harassment', 'scam') then 1
                     when p_category in ('fake_profile', 'inappropriate_content') then 2
                     else 3 end;
  insert into public.moderation_queue (item_type, report_id, subject_user_id, priority)
  values ('report', v_report, p_target, v_priority);
  insert into public.user_safety_events (user_id, actor_id, event_type, details)
  values (p_target, v_me, 'reported', jsonb_build_object('report_id', v_report, 'category', p_category));
  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administration (staff-only, fully audited)
-- ---------------------------------------------------------------------------
create or replace function private.require_staff()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_review_photo(p_photo uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ph public.profile_photos;
  v_queue uuid;
begin
  perform private.require_staff();
  select * into ph from public.profile_photos where id = p_photo for update;
  if not found or ph.status = 'uploading' then raise exception 'Photo not found' using errcode = 'P0002'; end if;
  update public.profile_photos
     set status = case when p_approve then 'approved' else 'rejected' end,
         rejection_reason = case when p_approve then null else left(p_reason, 300) end,
         position = case when p_approve then position end,   -- free the slot on rejection
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_photo;
  update public.moderation_queue set status = 'resolved', resolved_at = now()
   where photo_id = p_photo and status in ('open', 'in_review')
  returning id into v_queue;
  insert into public.moderation_actions (queue_id, actor_id, subject_user_id, action, notes)
  values (v_queue, auth.uid(), ph.user_id, case when p_approve then 'approve_photo' else 'reject_photo' end, p_reason);
  perform private.audit(case when p_approve then 'photo.approve' else 'photo.reject' end, 'photo', p_photo,
                        jsonb_build_object('user_id', ph.user_id, 'reason', p_reason));
  if not p_approve then
    insert into public.user_safety_events (user_id, actor_id, event_type, details)
    values (ph.user_id, auth.uid(), 'photo_rejected', jsonb_build_object('photo_id', p_photo));
    perform private.notify(ph.user_id, 'moderation', 'A photo wasn''t approved',
      coalesce('Reason: ' || p_reason, 'It doesn''t meet our community guidelines.'), jsonb_build_object('photo_id', p_photo));
  end if;
end;
$$;

create or replace function public.admin_update_report(p_report uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.user_reports;
begin
  perform private.require_staff();
  if p_status not in ('in_review', 'actioned', 'dismissed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.user_reports set status = p_status where id = p_report returning * into r;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  update public.moderation_queue
     set status = case p_status when 'in_review' then 'in_review' when 'dismissed' then 'dismissed' else 'resolved' end,
         assigned_to = auth.uid(),
         resolved_at = case when p_status = 'in_review' then null else now() end
   where report_id = p_report;
  insert into public.moderation_actions (queue_id, actor_id, subject_user_id, action, notes)
  select q.id, auth.uid(), r.reported_user_ref,
         case p_status when 'dismissed' then 'dismiss' when 'actioned' then 'resolve' else 'note' end, p_notes
  from public.moderation_queue q where q.report_id = p_report;
  perform private.audit('report.' || p_status, 'report', p_report,
                        jsonb_build_object('reported_user', r.reported_user_ref, 'notes', p_notes));
end;
$$;

create or replace function public.admin_set_suspension(p_user uuid, p_suspend boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if p_user = auth.uid() then raise exception 'You cannot suspend yourself' using errcode = '22023'; end if;
  if exists (select 1 from public.admin_users where user_id = p_user) and not private.is_admin() then
    raise exception 'Only admins can suspend staff accounts' using errcode = '42501';
  end if;
  update public.profiles
     set account_status = case when p_suspend then 'suspended' else 'active' end,
         suspended_reason = case when p_suspend then left(p_reason, 300) end
   where id = p_user;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  insert into public.moderation_actions (actor_id, subject_user_id, action, notes)
  values (auth.uid(), p_user, case when p_suspend then 'suspend' else 'unsuspend' end, p_reason);
  insert into public.user_safety_events (user_id, actor_id, event_type, details)
  values (p_user, auth.uid(), case when p_suspend then 'suspended' else 'unsuspended' end,
          jsonb_build_object('reason', p_reason));
  perform private.audit(case when p_suspend then 'user.suspend' else 'user.unsuspend' end, 'user', p_user,
                        jsonb_build_object('reason', p_reason));
  perform private.notify(p_user, 'moderation',
    case when p_suspend then 'Your account has been suspended' else 'Your account has been restored' end,
    coalesce(p_reason, ''), '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_role is not null and p_role not in ('moderator', 'admin') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if p_user = auth.uid() and p_role is distinct from 'admin' then
    raise exception 'You cannot remove your own admin role' using errcode = '22023';
  end if;
  if p_role is null then
    delete from public.admin_users where user_id = p_user;
  else
    insert into public.admin_users (user_id, role, granted_by) values (p_user, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
  end if;
  perform private.audit('role.set', 'user', p_user, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff();
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_onboarded', (select count(*) from public.profiles where onboarding_completed_at is not null),
    'users_active_7d', (select count(*) from public.profiles where last_active_at > now() - interval '7 days'),
    'users_suspended', (select count(*) from public.profiles where account_status = 'suspended'),
    'reports_open', (select count(*) from public.user_reports where status in ('open', 'in_review')),
    'photos_pending', (select count(*) from public.profile_photos where status = 'pending'),
    'queue_urgent', (select count(*) from public.moderation_queue where status in ('open', 'in_review') and priority = 1),
    'matches_7d', (select count(*) from public.matches where created_at > now() - interval '7 days'),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days')
  );
end;
$$;

create or replace function public.admin_search_users(p_query text default null, p_limit integer default 50)
returns table (id uuid, display_name text, email text, account_status text, onboarded boolean,
               report_count integer, staff_role text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_staff();
  return query
  select p.id, p.display_name, u.email::text, p.account_status, p.onboarding_completed_at is not null,
         (select count(*)::integer from public.user_reports r where r.reported_user_ref = p.id),
         (select a.role from public.admin_users a where a.user_id = p.id),
         p.created_at
  from public.profiles p join auth.users u on u.id = p.id
  where p_query is null or btrim(p_query) = ''
     or p.display_name ilike '%' || btrim(p_query) || '%'
     or u.email ilike '%' || btrim(p_query) || '%'
     or p.id::text = btrim(p_query)
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for public RPCs: signed-in users only.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.set_date_of_birth(date)', 'public.complete_onboarding()', 'public.touch_last_active()',
    'public.reorder_photos(uuid[])', 'public.get_discovery_candidates(integer)', 'public.get_profile_card(uuid)',
    'public.get_usage()', 'public.like_user(uuid, boolean)', 'public.pass_user(uuid)',
    'public.get_received_likes()', 'public.get_discovery_history(integer)', 'public.unmatch(uuid)',
    'public.send_message(uuid, text, uuid)', 'public.mark_conversation_read(uuid)',
    'public.set_conversation_archived(uuid, boolean)', 'public.list_conversations()',
    'public.mark_notifications_read(uuid[])', 'public.block_user(uuid, text)', 'public.unblock_user(uuid)',
    'public.list_blocked_users()', 'public.report_user(uuid, text, text, text, uuid)',
    'public.admin_review_photo(uuid, boolean, text)', 'public.admin_update_report(uuid, text, text)',
    'public.admin_set_suspension(uuid, boolean, text)', 'public.admin_set_role(uuid, text)',
    'public.admin_stats()', 'public.admin_search_users(text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

revoke all on function private.compute_completion(public.profiles), private.require_staff(),
  private.handle_new_user(), private.touch_completion(), private.profiles_before_update() from public;
grant execute on function private.compute_completion(public.profiles) to authenticated, service_role;
