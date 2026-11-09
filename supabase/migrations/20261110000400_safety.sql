-- =============================================================================
-- SPARK 0004 — Safety: blocks, reports, moderation queue, safety events
-- =============================================================================

create table public.user_blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  reason      text check (reason is null or char_length(reason) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);
create trigger user_blocks_updated_at before update on public.user_blocks
  for each row execute function private.set_updated_at();

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;            -- writes via block_user()/unblock_user()
create policy "blocks: blocker reads own" on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- Either direction blocked?
create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;
revoke all on function private.is_blocked_between(uuid, uuid) from public;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated, service_role;

-- Reports ---------------------------------------------------------------------
create table public.user_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid references public.profiles (id) on delete set null,
  reported_user_id  uuid references public.profiles (id) on delete set null,
  -- Retained identifier so moderation history survives account deletion.
  reported_user_ref uuid not null,
  category          text not null check (category in
                      ('fake_profile', 'harassment', 'inappropriate_content', 'scam', 'spam', 'underage', 'other')),
  details           text not null default '' check (char_length(details) <= 1000),
  context_type      text not null default 'profile' check (context_type in ('profile', 'message', 'photo')),
  context_id        uuid,
  status            text not null default 'open' check (status in ('open', 'in_review', 'actioned', 'dismissed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id is null or reporter_id <> reported_user_ref)
);
create index user_reports_status_idx on public.user_reports (status, created_at desc);
create index user_reports_reported_idx on public.user_reports (reported_user_ref);
create index user_reports_reporter_idx on public.user_reports (reporter_id);
create trigger user_reports_updated_at before update on public.user_reports
  for each row execute function private.set_updated_at();

alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;
grant select on public.user_reports to authenticated;           -- writes via report_user()
create policy "reports: reporter reads own" on public.user_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "reports: staff reads" on public.user_reports for select to authenticated
  using ((select private.is_staff()));

-- Moderation queue ------------------------------------------------------------
create table public.moderation_queue (
  id               uuid primary key default gen_random_uuid(),
  item_type        text not null check (item_type in ('report', 'photo', 'profile')),
  report_id        uuid references public.user_reports (id) on delete cascade,
  photo_id         uuid references public.profile_photos (id) on delete cascade,
  subject_user_id  uuid,               -- no FK: keep queue history after deletion
  priority         smallint not null default 2 check (priority between 1 and 3),   -- 1 = urgent
  status           text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_to      uuid references auth.users (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint moderation_queue_item check (
    (item_type = 'report' and report_id is not null) or
    (item_type = 'photo'  and photo_id  is not null) or
    (item_type = 'profile')
  )
);
create index moderation_queue_open_idx on public.moderation_queue (status, priority, created_at);
create unique index moderation_queue_photo_open_uidx on public.moderation_queue (photo_id)
  where status in ('open', 'in_review') and photo_id is not null;
create trigger moderation_queue_updated_at before update on public.moderation_queue
  for each row execute function private.set_updated_at();

create table public.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  queue_id    uuid references public.moderation_queue (id) on delete set null,
  actor_id    uuid references auth.users (id) on delete set null,
  subject_user_id uuid,
  action      text not null check (action in
                ('approve_photo', 'reject_photo', 'dismiss', 'warn', 'suspend', 'unsuspend', 'resolve', 'note')),
  notes       text check (notes is null or char_length(notes) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index moderation_actions_queue_idx on public.moderation_actions (queue_id);
create index moderation_actions_subject_idx on public.moderation_actions (subject_user_id, created_at desc);

create table public.user_safety_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                    -- subject; no FK so history survives deletion
  actor_id    uuid,
  event_type  text not null check (event_type in
                ('blocked', 'unblocked', 'reported', 'suspended', 'unsuspended', 'photo_rejected',
                 'unmatched', 'rate_limited', 'account_deleted')),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index user_safety_events_user_idx on public.user_safety_events (user_id, created_at desc);

alter table public.moderation_queue enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.user_safety_events enable row level security;
revoke all on public.moderation_queue, public.moderation_actions, public.user_safety_events from anon, authenticated;
grant select on public.moderation_queue, public.moderation_actions, public.user_safety_events to authenticated;
create policy "queue: staff reads" on public.moderation_queue for select to authenticated using ((select private.is_staff()));
create policy "mod actions: staff reads" on public.moderation_actions for select to authenticated using ((select private.is_staff()));
create policy "safety events: staff reads" on public.user_safety_events for select to authenticated using ((select private.is_staff()));

-- Photos entering 'pending' are queued for review automatically.
create or replace function private.enqueue_pending_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    insert into public.moderation_queue (item_type, photo_id, subject_user_id, priority)
    values ('photo', new.id, new.user_id, 3)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger profile_photos_enqueue after insert or update of status on public.profile_photos
  for each row execute function private.enqueue_pending_photo();
