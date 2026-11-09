-- =============================================================================
-- SPARK 0007 — Reference data (interests, free plan) and Realtime configuration
-- =============================================================================

-- Interests catalog --------------------------------------------------------------
insert into public.interests (slug, label, category, emoji) values
  ('coffee', 'Coffee', 'food', '☕'), ('street_food', 'Street food', 'food', '🍢'),
  ('cooking', 'Cooking', 'food', '🍳'), ('baking', 'Baking', 'food', '🧁'),
  ('brunch', 'Brunch', 'food', '🥞'), ('spicy_food', 'Spicy food', 'food', '🌶️'),
  ('kpop', 'K-pop', 'music', '🎤'), ('indie_music', 'Indie music', 'music', '🎧'),
  ('live_music', 'Live music', 'music', '🎸'), ('karaoke', 'Karaoke', 'music', '🎙️'),
  ('jazz', 'Jazz', 'music', '🎷'), ('dangdut', 'Dangdut', 'music', '🪘'),
  ('badminton', 'Badminton', 'sport', '🏸'), ('football', 'Football', 'sport', '⚽'),
  ('running', 'Running', 'sport', '🏃'), ('gym', 'Gym', 'sport', '🏋️'),
  ('yoga', 'Yoga', 'sport', '🧘'), ('padel', 'Padel', 'sport', '🎾'),
  ('cycling', 'Cycling', 'sport', '🚴'), ('swimming', 'Swimming', 'sport', '🏊'),
  ('hiking', 'Hiking', 'outdoors', '🥾'), ('beach', 'Beach days', 'outdoors', '🏖️'),
  ('diving', 'Diving', 'outdoors', '🤿'), ('camping', 'Camping', 'outdoors', '🏕️'),
  ('surfing', 'Surfing', 'outdoors', '🏄'), ('road_trips', 'Road trips', 'travel', '🚗'),
  ('backpacking', 'Backpacking', 'travel', '🎒'), ('city_breaks', 'City breaks', 'travel', '🏙️'),
  ('photography', 'Photography', 'arts', '📷'), ('drawing', 'Drawing', 'arts', '✏️'),
  ('museums', 'Museums', 'arts', '🖼️'), ('writing', 'Writing', 'arts', '✍️'),
  ('films', 'Films', 'arts', '🎬'), ('theatre', 'Theatre', 'arts', '🎭'),
  ('reading', 'Reading', 'hobby', '📚'), ('gaming', 'Gaming', 'hobby', '🎮'),
  ('board_games', 'Board games', 'hobby', '🎲'), ('anime', 'Anime', 'hobby', '🍥'),
  ('gardening', 'Gardening', 'hobby', '🌱'), ('thrifting', 'Thrifting', 'hobby', '🛍️'),
  ('podcasts', 'Podcasts', 'hobby', '🎙'), ('dancing', 'Dancing', 'hobby', '💃'),
  ('coding', 'Coding', 'tech', '💻'), ('startups', 'Startups', 'tech', '🚀'),
  ('gadgets', 'Gadgets', 'tech', '📱'), ('volunteering', 'Volunteering', 'lifestyle', '🤝'),
  ('pets', 'Pets', 'lifestyle', '🐾'), ('wellness', 'Wellness', 'lifestyle', '🌿'),
  ('fashion', 'Fashion', 'lifestyle', '👗'), ('skincare', 'Skincare', 'lifestyle', '🧴'),
  ('languages', 'Learning languages', 'lifestyle', '🗣️'), ('spirituality', 'Spirituality', 'lifestyle', '🕊️')
on conflict (slug) do nothing;

-- Plans. Only the free plan is active in the MVP. Premium is defined but
-- inactive: no payment provider is integrated and nothing can grant it except
-- an audited admin/service-role entitlement.
insert into public.subscription_plans (code, name, description, price_idr, billing_interval, entitlements, is_active) values
  ('free', 'SPARK Free', 'Everything you need to find a spark.', 0, null,
   '{"daily_likes": 25, "daily_super_likes": 1, "see_likes": false, "advanced_filters": false, "rewind": false, "advanced_chemistry": false}', true),
  ('plus', 'SPARK Plus', 'More likes, see who likes you, advanced chemistry insights.', 89000, 'month',
   '{"daily_likes": 150, "daily_super_likes": 5, "see_likes": true, "advanced_filters": true, "rewind": true, "advanced_chemistry": true}', false)
on conflict (code) do nothing;

-- Supabase Realtime --------------------------------------------------------------
-- Postgres Changes for chat and notifications (RLS is enforced per subscriber).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.message_read_receipts, public.notifications, public.conversations;
  end if;
end;
$$;

-- Typing indicators use Realtime Broadcast on private channels named
-- `conversation:<uuid>` (no database writes per keystroke). Only conversation
-- members may join/send on that channel.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute $p$
      create policy "spark: members receive conversation broadcasts" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() ~ '^conversation:[0-9a-f-]{36}$'
          and private.is_conversation_member(substring(realtime.topic() from 14)::uuid)
        )
    $p$;
    execute $p$
      create policy "spark: members send conversation broadcasts" on realtime.messages
        for insert to authenticated
        with check (
          realtime.topic() ~ '^conversation:[0-9a-f-]{36}$'
          and private.is_conversation_member(substring(realtime.topic() from 14)::uuid)
        )
    $p$;
  end if;
end;
$$;
