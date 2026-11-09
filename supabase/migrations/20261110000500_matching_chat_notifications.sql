-- =============================================================================
-- SPARK 0005 — Discovery, matching, chat, notifications, monetization tables
-- =============================================================================
-- All state-changing operations for these tables go through SECURITY DEFINER
-- functions in 0006 (like_user, pass_user, send_message, ...). Clients get
-- SELECT only, scoped by RLS.
-- =============================================================================

-- Likes & passes ----------------------------------------------------------------
create table public.likes (
  id          uuid primary key default gen_random_uuid(),
  liker_id    uuid not null references public.profiles (id) on delete cascade,
  likee_id    uuid not null references public.profiles (id) on delete cascade,
  is_super    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint likes_not_self check (liker_id <> likee_id),
  unique (liker_id, likee_id)
);
create index likes_likee_idx on public.likes (likee_id, created_at desc);
create trigger likes_updated_at before update on public.likes
  for each row execute function private.set_updated_at();

create table public.passes (
  id          uuid primary key default gen_random_uuid(),
  passer_id   uuid not null references public.profiles (id) on delete cascade,
  passee_id   uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint passes_not_self check (passer_id <> passee_id),
  unique (passer_id, passee_id)
);
create index passes_passee_idx on public.passes (passee_id);
create trigger passes_updated_at before update on public.passes
  for each row execute function private.set_updated_at();

alter table public.likes enable row level security;
alter table public.passes enable row level security;
revoke all on public.likes, public.passes from anon, authenticated;
grant select on public.likes, public.passes to authenticated;
-- Users see the likes they SENT. Received likes are exposed only through
-- get_received_likes(), which enforces the premium entitlement.
create policy "likes: liker reads own" on public.likes for select to authenticated
  using (liker_id = (select auth.uid()));
create policy "passes: passer reads own" on public.passes for select to authenticated
  using (passer_id = (select auth.uid()));

-- Matches -----------------------------------------------------------------------
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  user_low      uuid not null references public.profiles (id) on delete cascade,
  user_high     uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'active' check (status in ('active', 'unmatched', 'blocked')),
  ended_by      uuid references public.profiles (id) on delete set null,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint matches_ordered check (user_low < user_high),
  constraint matches_pair_unique unique (user_low, user_high)   -- one match per pair, ever
);
create index matches_high_idx on public.matches (user_high);
create trigger matches_updated_at before update on public.matches
  for each row execute function private.set_updated_at();

create table public.match_members (
  match_id    uuid not null references public.matches (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index match_members_user_idx on public.match_members (user_id);

alter table public.matches enable row level security;
alter table public.match_members enable row level security;
revoke all on public.matches, public.match_members from anon, authenticated;
grant select on public.matches, public.match_members to authenticated;
create policy "matches: participants read" on public.matches for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));
create policy "match_members: participants read" on public.match_members for select to authenticated
  using (exists (select 1 from public.matches m
                 where m.id = match_id and (select auth.uid()) in (m.user_low, m.user_high)));

create or replace function private.have_active_match(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matches
                 where user_low = least(a, b) and user_high = greatest(a, b) and status = 'active')
$$;
revoke all on function private.have_active_match(uuid, uuid) from public;
grant execute on function private.have_active_match(uuid, uuid) to authenticated, service_role;

-- Usage limits & discovery events ------------------------------------------------
create table public.daily_usage_limits (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  usage_date       date not null,
  likes_used       integer not null default 0 check (likes_used >= 0),
  super_likes_used integer not null default 0 check (super_likes_used >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, usage_date)
);
create trigger daily_usage_limits_updated_at before update on public.daily_usage_limits
  for each row execute function private.set_updated_at();

create table public.discovery_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  target_id   uuid references public.profiles (id) on delete set null,
  event_type  text not null check (event_type in ('like', 'super_like', 'pass', 'match', 'profile_view')),
  created_at  timestamptz not null default now()
);
create index discovery_events_user_idx on public.discovery_events (user_id, created_at desc);

alter table public.daily_usage_limits enable row level security;
alter table public.discovery_events enable row level security;
revoke all on public.daily_usage_limits, public.discovery_events from anon, authenticated;
grant select on public.daily_usage_limits, public.discovery_events to authenticated;
create policy "usage: owner reads" on public.daily_usage_limits for select to authenticated
  using (user_id = (select auth.uid()));
create policy "discovery events: owner reads" on public.discovery_events for select to authenticated
  using (user_id = (select auth.uid()));

-- Conversations & messages --------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null unique references public.matches (id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'closed')),
  last_message_at  timestamptz,
  last_message_preview text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger conversations_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();

create table public.conversation_members (
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);
create trigger conversation_members_updated_at before update on public.conversation_members
  for each row execute function private.set_updated_at();

create or replace function private.is_conversation_member(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members
                 where conversation_id = p_conversation and user_id = (select auth.uid()))
$$;
revoke all on function private.is_conversation_member(uuid) from public;
grant execute on function private.is_conversation_member(uuid) to authenticated, service_role;

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid references public.profiles (id) on delete set null,
  body             text not null check (char_length(btrim(body)) between 1 and 2000),
  client_id        uuid,                         -- idempotency key from the sender
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint messages_client_unique unique (sender_id, client_id)
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_created_idx on public.messages (sender_id, created_at desc);
create trigger messages_updated_at before update on public.messages
  for each row execute function private.set_updated_at();

create table public.message_read_receipts (
  conversation_id       uuid not null references public.conversations (id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id  uuid references public.messages (id) on delete set null,
  last_read_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create trigger message_read_receipts_updated_at before update on public.message_read_receipts
  for each row execute function private.set_updated_at();

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_read_receipts enable row level security;
revoke all on public.conversations, public.conversation_members, public.messages, public.message_read_receipts
  from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.message_read_receipts
  to authenticated;
create policy "conversations: members read" on public.conversations for select to authenticated
  using ((select private.is_conversation_member(id)));
create policy "conversation_members: members read" on public.conversation_members for select to authenticated
  using ((select private.is_conversation_member(conversation_id)));
create policy "messages: members read" on public.messages for select to authenticated
  using ((select private.is_conversation_member(conversation_id)));
create policy "receipts: members read" on public.message_read_receipts for select to authenticated
  using ((select private.is_conversation_member(conversation_id)));

-- Notifications --------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (type in ('new_like', 'new_match', 'new_message', 'moderation', 'safety', 'system')),
  title       text not null,
  body        text not null default '',
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create trigger notifications_updated_at before update on public.notifications
  for each row execute function private.set_updated_at();

create table public.notification_preferences (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  new_like       boolean not null default true,
  new_match      boolean not null default true,
  new_message    boolean not null default true,
  moderation     boolean not null default true,   -- safety notices are always delivered
  push_enabled   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

-- Web Push subscriptions (architecture only; delivery is post-MVP)
create table public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint like 'https://%'),
  p256dh      text not null,
  auth_secret text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id);
create trigger device_tokens_updated_at before update on public.device_tokens
  for each row execute function private.set_updated_at();

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.device_tokens enable row level security;
revoke all on public.notifications, public.notification_preferences, public.device_tokens from anon, authenticated;
grant select on public.notifications to authenticated;          -- mark read via mark_notifications_read()
grant select, update (new_like, new_match, new_message, moderation, push_enabled)
  on public.notification_preferences to authenticated;
grant select, insert, delete on public.device_tokens to authenticated;
create policy "notifications: owner reads" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notif prefs: owner reads" on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notif prefs: owner updates" on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "device tokens: owner reads" on public.device_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy "device tokens: owner inserts" on public.device_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "device tokens: owner deletes" on public.device_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- Internal notification writer respecting preferences.
create or replace function private.notify(
  p_user uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  prefs public.notification_preferences;
begin
  select * into prefs from public.notification_preferences where user_id = p_user;
  if found and (
       (p_type = 'new_like' and not prefs.new_like) or
       (p_type = 'new_match' and not prefs.new_match) or
       (p_type = 'new_message' and not prefs.new_message) or
       (p_type = 'moderation' and not prefs.moderation)) then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user, p_type, p_title, coalesce(p_body, ''), coalesce(p_data, '{}'::jsonb));
end;
$$;
revoke all on function private.notify(uuid, text, text, text, jsonb) from public;

-- Monetization (future; NO payment integration in the MVP) ------------------------
create table public.subscription_plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z0-9_]+$'),
  name             text not null,
  description      text not null default '',
  price_idr        integer not null default 0 check (price_idr >= 0),
  billing_interval text check (billing_interval in ('month', 'quarter', 'year')),
  -- Default entitlements granted by the plan, e.g. {"daily_likes": 100, "see_likes": true}
  entitlements     jsonb not null default '{}'::jsonb,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function private.set_updated_at();

create table public.user_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  plan_id               uuid not null references public.subscription_plans (id),
  status                text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  provider              text,
  provider_subscription_id text,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index user_subscriptions_user_idx on public.user_subscriptions (user_id, status);
create trigger user_subscriptions_updated_at before update on public.user_subscriptions
  for each row execute function private.set_updated_at();

create table public.subscription_entitlements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  key          text not null check (key in ('daily_likes', 'daily_super_likes', 'see_likes', 'advanced_filters',
                                            'rewind', 'advanced_chemistry', 'boost')),
  value        jsonb not null,
  source       text not null check (source in ('subscription', 'promo', 'admin_grant')),
  subscription_id uuid references public.user_subscriptions (id) on delete cascade,
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index subscription_entitlements_user_idx on public.subscription_entitlements (user_id, key);
create trigger subscription_entitlements_updated_at before update on public.subscription_entitlements
  for each row execute function private.set_updated_at();

create table public.payment_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text not null,
  user_id            uuid references public.profiles (id) on delete set null,
  event_type         text not null,
  payload            jsonb not null,
  processed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create trigger payment_events_updated_at before update on public.payment_events
  for each row execute function private.set_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.subscription_plans, public.user_subscriptions, public.subscription_entitlements,
              public.payment_events from anon, authenticated;
grant select on public.subscription_plans, public.user_subscriptions, public.subscription_entitlements to authenticated;
-- payment_events: no client access at all (service role only).
create policy "plans: signed-in read active" on public.subscription_plans for select to authenticated using (is_active);
create policy "subscriptions: owner reads" on public.user_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "entitlements: owner reads" on public.subscription_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

-- Resolve an entitlement: explicit active grant > free-plan default > fallback.
create or replace function private.entitlement(p_user uuid, p_key text, p_default jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select e.value from public.subscription_entitlements e
      where e.user_id = p_user and e.key = p_key
        and e.starts_at <= now() and (e.expires_at is null or e.expires_at > now())
      order by e.created_at desc limit 1),
    (select p.entitlements -> p_key from public.subscription_plans p where p.code = 'free' and p.is_active),
    p_default)
$$;
revoke all on function private.entitlement(uuid, text, jsonb) from public;
grant execute on function private.entitlement(uuid, text, jsonb) to service_role;
