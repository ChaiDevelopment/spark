-- =============================================================================
-- SPARK 0002 — Profiles, private profile data, preferences, interests, photos
-- =============================================================================
-- Cross-user visibility (who may read whose profile) is added in 0007 once
-- blocks and matches exist. Here: owner + staff access only.
-- =============================================================================

-- Public-facing profile (row visible to others only via 0007 rules) -----------
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text not null default '' check (char_length(display_name) <= 40),
  pronouns                text check (pronouns is null or char_length(pronouns) <= 24),
  gender                  text check (gender in ('woman', 'man', 'non_binary', 'other')),
  bio                     text not null default '' check (char_length(bio) <= 500),
  city                    text check (city is null or char_length(city) between 2 and 60),
  region                  text check (region is null or char_length(region) between 2 and 60),
  country_code            char(2) not null default 'ID' check (country_code ~ '^[A-Z]{2}$'),
  city_key                text generated always as (lower(btrim(city))) stored,
  region_key              text generated always as (lower(btrim(region))) stored,
  relationship_goal       text check (relationship_goal in
                            ('long_term', 'long_term_open', 'short_term_open', 'new_friends', 'figuring_out')),
  drinking                text check (drinking in ('never', 'rarely', 'socially', 'often')),
  smoking                 text check (smoking in ('never', 'sometimes', 'regularly')),
  exercise                text check (exercise in ('never', 'sometimes', 'often', 'daily')),
  communication_style     text check (communication_style in ('texter', 'caller', 'video', 'in_person', 'mix')),
  is_visible              boolean not null default true,      -- user-controlled "pause my profile"
  show_gender             boolean not null default true,
  account_status          text not null default 'active'
                            check (account_status in ('active', 'suspended', 'deactivated')),
  suspended_reason        text,
  onboarding_completed_at timestamptz,
  completion_percent      smallint not null default 0 check (completion_percent between 0 and 100),
  last_active_at          timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Discovery filter indexes
create index profiles_discovery_idx on public.profiles (account_status, is_visible, gender)
  where onboarding_completed_at is not null;
create index profiles_city_idx on public.profiles (country_code, city_key);
create index profiles_region_idx on public.profiles (country_code, region_key);
create index profiles_last_active_idx on public.profiles (last_active_at desc);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column-level grant: users can never change status, onboarding or completion.
grant update (display_name, pronouns, gender, bio, city, region, country_code, relationship_goal,
              drinking, smoking, exercise, communication_style, is_visible, show_gender)
  on public.profiles to authenticated;

create policy "profiles: owner reads" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: staff reads" on public.profiles for select to authenticated
  using ((select private.is_staff()));
create policy "profiles: owner updates" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and account_status = 'active')
  with check (id = (select auth.uid()));

-- Private profile data (date of birth). Never readable by anyone but the owner.
create table public.profile_private (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth  date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profile_private_dob_sane check (date_of_birth > date '1900-01-01')
);
create trigger profile_private_updated_at before update on public.profile_private
  for each row execute function private.set_updated_at();

-- Adults only, validated in the database (CHECK cannot use now(); a trigger can).
create or replace function private.enforce_adult_dob()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.date_of_birth > (private.app_today() - interval '18 years')::date then
    raise exception 'You must be at least 18 years old to use SPARK.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger profile_private_adult before insert or update on public.profile_private
  for each row execute function private.enforce_adult_dob();

alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;   -- writes only via set_date_of_birth()
create policy "profile_private: owner reads" on public.profile_private for select to authenticated
  using (user_id = (select auth.uid()));

-- Age helper (only exposes the integer age, never the date).
create or replace function private.age_of(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select extract(year from age(private.app_today(), date_of_birth))::integer
  from public.profile_private where user_id = p_user
$$;
revoke all on function private.age_of(uuid) from public;
grant execute on function private.age_of(uuid) to authenticated, service_role;

-- Discovery preferences --------------------------------------------------------
create table public.user_preferences (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  interested_in   text[] not null default '{}'::text[]
                    check (interested_in <@ array['woman', 'man', 'non_binary', 'other']::text[]),
  min_age         smallint not null default 18 check (min_age between 18 and 99),
  max_age         smallint not null default 45 check (max_age between 18 and 99),
  location_scope  text not null default 'country' check (location_scope in ('city', 'region', 'country', 'anywhere')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint user_preferences_age_range check (min_age <= max_age)
);
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();
create index user_preferences_interested_in_idx on public.user_preferences using gin (interested_in);

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon, authenticated;
grant select, update (interested_in, min_age, max_age, location_scope) on public.user_preferences to authenticated;
create policy "prefs: owner reads" on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "prefs: owner updates" on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Interests catalog --------------------------------------------------------------
create table public.interests (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9_]+$'),
  label       text not null,
  category    text not null check (category in ('hobby', 'music', 'food', 'sport', 'travel', 'arts', 'tech', 'lifestyle', 'outdoors')),
  emoji       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger interests_updated_at before update on public.interests
  for each row execute function private.set_updated_at();

alter table public.interests enable row level security;
revoke all on public.interests from anon, authenticated;
grant select on public.interests to anon, authenticated;
create policy "interests: anyone reads active" on public.interests for select to anon, authenticated
  using (is_active);

create table public.user_interests (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  interest_id  uuid not null references public.interests (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, interest_id)
);
create index user_interests_interest_idx on public.user_interests (interest_id);

create or replace function private.enforce_interest_cap()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.user_interests where user_id = new.user_id) >= 12 then
    raise exception 'You can pick up to 12 interests.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger user_interests_cap before insert on public.user_interests
  for each row execute function private.enforce_interest_cap();

alter table public.user_interests enable row level security;
revoke all on public.user_interests from anon, authenticated;
grant select, insert, delete on public.user_interests to authenticated;
create policy "user_interests: owner reads" on public.user_interests for select to authenticated
  using (user_id = (select auth.uid()));
create policy "user_interests: owner inserts" on public.user_interests for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "user_interests: owner deletes" on public.user_interests for delete to authenticated
  using (user_id = (select auth.uid()));

-- Verification (photo/ID verification is a future feature; status is staff-managed)
create table public.user_verification (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  status       text not null default 'unverified' check (status in ('unverified', 'pending', 'verified', 'rejected')),
  method       text check (method in ('selfie', 'id_document')),
  verified_at  timestamptz,
  reviewed_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger user_verification_updated_at before update on public.user_verification
  for each row execute function private.set_updated_at();

alter table public.user_verification enable row level security;
revoke all on public.user_verification from anon, authenticated;
grant select on public.user_verification to authenticated;
create policy "verification: owner or staff reads" on public.user_verification for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

-- Profile photos (binary lives in Cloudflare R2; only metadata + object keys here)
create table public.profile_photos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  staging_key     text not null unique,            -- raw upload, deleted after processing
  object_key      text unique,                     -- processed main image (webp)
  thumb_key       text unique,                     -- processed thumbnail (webp)
  status          text not null default 'uploading'
                    check (status in ('uploading', 'pending', 'approved', 'rejected')),
  position        smallint check (position between 0 and 5),
  content_type    text,
  bytes           integer check (bytes is null or bytes between 1 and 10485760),
  width           integer,
  height          integer,
  rejection_reason text,
  reviewed_by     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  processing_version smallint not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint profile_photos_keys_scoped check (
    staging_key like 'uploads/' || user_id::text || '/%'
    and (object_key is null or object_key like 'profiles/' || user_id::text || '/%')
    and (thumb_key  is null or thumb_key  like 'profiles/' || user_id::text || '/%')
  ),
  constraint profile_photos_processed check (status = 'uploading' or (object_key is not null and thumb_key is not null))
);
alter table public.profile_photos
  add constraint profile_photos_position_unique unique (user_id, position) deferrable initially deferred;
create trigger profile_photos_updated_at before update on public.profile_photos
  for each row execute function private.set_updated_at();
create index profile_photos_user_idx on public.profile_photos (user_id, position);
create index profile_photos_status_idx on public.profile_photos (status, created_at) where status = 'pending';

-- Max 6 live photos per user (stale 'uploading' reservations older than 1h don't count)
create or replace function private.enforce_photo_cap()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.profile_photos p
       where p.user_id = new.user_id
         and p.status <> 'rejected'
         and (p.status <> 'uploading' or p.created_at > now() - interval '1 hour')) >= 6 then
    raise exception 'You can have up to 6 photos.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger profile_photos_cap before insert on public.profile_photos
  for each row execute function private.enforce_photo_cap();

alter table public.profile_photos enable row level security;
revoke all on public.profile_photos from anon, authenticated;
-- Clients only read. Inserts/updates/deletes go through validated server routes
-- (service role) or SECURITY DEFINER RPCs (reorder_photos).
grant select on public.profile_photos to authenticated;
create policy "photos: owner reads" on public.profile_photos for select to authenticated
  using (user_id = (select auth.uid()));
create policy "photos: staff reads" on public.profile_photos for select to authenticated
  using ((select private.is_staff()));
