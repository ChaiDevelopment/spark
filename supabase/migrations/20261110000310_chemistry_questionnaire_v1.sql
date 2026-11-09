-- =============================================================================
-- SPARK 0003b — Chemistry questionnaire v1 (reference data, 42 questions)
-- =============================================================================
-- Scale questions all use the same 5-point "how much is this you?" scale.
-- Single-choice questions carry an explicit compatibility matrix:
--   {"default": <score for unlisted different answers>, "pairs": {"a:b": score}}
-- Identical answers always score 1. Pairs are symmetric.
-- =============================================================================

create function pg_temp.q(
  p_code text, p_dim text, p_kind text, p_pos smallint, p_prompt text, p_label text,
  p_options text[], p_matrix jsonb default null, p_max smallint default 1
) returns void language plpgsql as $$
declare
  v_id uuid;
  v_opt text;
  v_parts text[];
  v_i smallint := 0;
begin
  insert into public.chemistry_questions
    (questionnaire_version, code, dimension, kind, prompt, short_label, max_choices, compat_matrix, position)
  values (1, p_code, p_dim, p_kind, p_prompt, p_label, p_max, p_matrix, p_pos)
  returning id into v_id;
  foreach v_opt in array p_options loop
    v_parts := string_to_array(v_opt, '|');
    insert into public.chemistry_options (question_id, key, label, value, position)
    values (v_id, v_parts[1], v_parts[2], nullif(v_parts[3], '')::numeric, v_i);
    v_i := v_i + 1;
  end loop;
end;
$$;

-- Shared 5-point scale
create function pg_temp.scale() returns text[] language sql as $$
  select array['s1|Not me at all|1', 's2|Rarely me|2', 's3|Sometimes|3', 's4|Mostly me|4', 's5|Totally me|5']
$$;

-- ---------------------------------------------------------------- Personality
select pg_temp.q('p_social_recharge', 'personality', 'scale', 1::smallint,
  'After a busy week, I recharge by being around people.', 'how you recharge', pg_temp.scale());
select pg_temp.q('p_spontaneous', 'personality', 'scale', 2::smallint,
  'I love spontaneous plans more than scheduled ones.', 'spontaneity', pg_temp.scale());
select pg_temp.q('p_open_feelings', 'personality', 'scale', 3::smallint,
  'I talk through my feelings rather than keep them in.', 'emotional openness', pg_temp.scale());
select pg_temp.q('p_planner', 'personality', 'scale', 4::smallint,
  'I''m usually the one who plans the trip.', 'planning', pg_temp.scale());
select pg_temp.q('p_novelty', 'personality', 'scale', 5::smallint,
  'New experiences excite me more than familiar comforts.', 'appetite for new things', pg_temp.scale());
select pg_temp.q('p_vibe', 'personality', 'single', 6::smallint,
  'Your friends would describe you as…', 'overall vibe',
  array['calm|Calm and grounded|', 'energetic|Full of energy|', 'thoughtful|Thoughtful|', 'funny|The funny one|', 'adventurous|Adventurous|'],
  '{"default": 0.55, "pairs": {"calm:thoughtful": 0.85, "energetic:adventurous": 0.85, "funny:energetic": 0.8, "calm:energetic": 0.45}}');
select pg_temp.q('p_calm_chaos', 'personality', 'scale', 7::smallint,
  'I stay calm when plans fall apart.', 'handling surprises', pg_temp.scale());

-- -------------------------------------------------------------- Communication
select pg_temp.q('c_text_freq', 'communication', 'single', 8::smallint,
  'How often do you like to text someone you''re dating?', 'texting rhythm',
  array['constantly|All day, every day|', 'daily|A good check-in daily|', 'few_week|A few times a week|', 'rarely|Rarely — save it for dates|'],
  '{"default": 0.2, "pairs": {"constantly:daily": 0.7, "daily:few_week": 0.7, "few_week:rarely": 0.65, "constantly:few_week": 0.3, "daily:rarely": 0.3, "constantly:rarely": 0}}');
select pg_temp.q('c_channel', 'communication', 'single', 9::smallint,
  'Your favorite way to stay in touch', 'staying in touch',
  array['texting|Texting|', 'voice_notes|Voice notes|', 'calls|Phone calls|', 'video|Video calls|', 'in_person|Saving it for in person|'],
  '{"default": 0.4, "pairs": {"texting:voice_notes": 0.75, "calls:video": 0.8, "calls:voice_notes": 0.7}}');
select pg_temp.q('c_conflict', 'communication', 'single', 10::smallint,
  'In a disagreement, you prefer to…', 'handling disagreements',
  array['talk_now|Talk it out right away|', 'cool_off|Cool off, then talk|', 'write_it|Write down my thoughts first|', 'let_go|Let small things go|'],
  '{"default": 0.4, "pairs": {"talk_now:cool_off": 0.55, "cool_off:write_it": 0.75, "talk_now:let_go": 0.15, "cool_off:let_go": 0.5, "write_it:let_go": 0.35}}');
select pg_temp.q('c_direct', 'communication', 'scale', 11::smallint,
  'I say what I need directly, even when it''s awkward.', 'directness', pg_temp.scale());
select pg_temp.q('c_reply_speed', 'communication', 'scale', 12::smallint,
  'Quick replies matter to me.', 'reply speed', pg_temp.scale());
select pg_temp.q('c_care_language', 'communication', 'single', 13::smallint,
  'How do you most naturally show you care?', 'showing care',
  array['words|Kind words|', 'time|Quality time|', 'gifts|Thoughtful gifts|', 'acts|Helping out|', 'touch|Physical affection|'],
  '{"default": 0.55}');
select pg_temp.q('c_deep_talks', 'communication', 'scale', 14::smallint,
  'I enjoy deep conversations late into the night.', 'deep conversations', pg_temp.scale());

-- ------------------------------------------------------------------ Lifestyle
select pg_temp.q('l_weekend', 'lifestyle', 'single', 15::smallint,
  'Your ideal weekend', 'weekend plans',
  array['outdoors|Outdoors & active|', 'social|Out with friends|', 'cozy|Cozy at home|', 'creative|Making something|', 'mix|A bit of everything|'],
  '{"default": 0.35, "pairs": {"mix:outdoors": 0.7, "mix:social": 0.7, "mix:cozy": 0.7, "mix:creative": 0.7, "cozy:creative": 0.65, "outdoors:social": 0.55}}');
select pg_temp.q('l_chronotype', 'lifestyle', 'single', 16::smallint,
  'You feel most alive in the…', 'daily rhythm',
  array['morning|Morning|', 'afternoon|Afternoon|', 'night|Late night|'],
  '{"default": 0.5, "pairs": {"morning:night": 0.2}}');
select pg_temp.q('l_exercise', 'lifestyle', 'single', 17::smallint,
  'How often do you work out?', 'fitness habits',
  array['never|Rarely or never|', 'sometimes|Sometimes|', 'often|Often|', 'daily|Daily|'],
  '{"default": 0.3, "pairs": {"never:sometimes": 0.7, "sometimes:often": 0.75, "often:daily": 0.8, "never:daily": 0.1}}');
select pg_temp.q('l_drinking', 'lifestyle', 'single', 18::smallint,
  'Your relationship with alcohol', 'drinking',
  array['never|I don''t drink|', 'rarely|Rarely|', 'socially|Socially|', 'often|Regularly|'],
  '{"default": 0.3, "pairs": {"never:rarely": 0.75, "rarely:socially": 0.75, "socially:often": 0.7, "never:often": 0}}');
select pg_temp.q('l_smoking', 'lifestyle', 'single', 19::smallint,
  'How do you feel about smoking?', 'smoking',
  array['no_smoke_strict|Don''t smoke, and prefer a non-smoker|', 'no_smoke_ok|Don''t smoke, but I''m fine with it|', 'smoker|I smoke|'],
  '{"default": 0.5, "pairs": {"no_smoke_strict:no_smoke_ok": 0.9, "no_smoke_strict:smoker": 0, "no_smoke_ok:smoker": 0.65}}');
select pg_temp.q('l_tidiness', 'lifestyle', 'single', 20::smallint,
  'Your space is usually…', 'tidiness',
  array['very_tidy|Spotless|', 'mostly_tidy|Mostly tidy|', 'relaxed|Lived-in and relaxed|'],
  '{"default": 0.4, "pairs": {"very_tidy:mostly_tidy": 0.75, "mostly_tidy:relaxed": 0.7, "very_tidy:relaxed": 0.15}}');
select pg_temp.q('l_pets', 'lifestyle', 'single', 21::smallint,
  'Pets?', 'pets',
  array['have|I have pets|', 'want|I''d love pets|', 'neutral|Neutral|', 'no_pets|No pets for me|'],
  '{"default": 0.5, "pairs": {"have:want": 0.9, "have:no_pets": 0.05, "want:no_pets": 0.15, "neutral:no_pets": 0.7, "have:neutral": 0.55}}');

-- ------------------------------------------------------------------ Interests
select pg_temp.q('i_free_evening', 'interests', 'multi', 22::smallint,
  'Favorite ways to spend a free evening (pick up to 3)', 'free evenings',
  array['movies|Movies|', 'gaming|Gaming|', 'reading|Reading|', 'cooking|Cooking|', 'live_music|Live music|',
        'cafe|Café hopping|', 'sports|Playing sports|', 'gym|Gym|', 'art|Art & crafts|', 'nightlife|Nightlife|'],
  null, 3::smallint);
select pg_temp.q('i_music', 'interests', 'multi', 23::smallint,
  'Music on repeat (pick up to 3)', 'music taste',
  array['pop|Pop|', 'indie|Indie|', 'kpop|K-pop|', 'dangdut|Dangdut|', 'hiphop|Hip-hop|', 'rnb|R&B|',
        'rock|Rock|', 'edm|EDM|', 'jazz|Jazz|', 'classical|Classical|'],
  null, 3::smallint);
select pg_temp.q('i_trip', 'interests', 'multi', 24::smallint,
  'Your kind of trip (pick up to 3)', 'travel style',
  array['beach|Beach|', 'mountains|Mountains|', 'city|City break|', 'culture|Culture & history|', 'food_trip|Food trip|', 'staycation|Staycation|'],
  null, 3::smallint);
select pg_temp.q('i_food', 'interests', 'multi', 25::smallint,
  'Food you''d travel for (pick up to 3)', 'food',
  array['street_food|Street food|', 'japanese|Japanese|', 'korean|Korean|', 'western|Western|', 'padang|Padang|',
        'sundanese|Sundanese|', 'dessert|Desserts|', 'vegetarian|Vegetarian|'],
  null, 3::smallint);
select pg_temp.q('i_try_new', 'interests', 'scale', 26::smallint,
  'I''d try a hobby my partner loves, even if it''s new to me.', 'trying each other''s hobbies', pg_temp.scale());
select pg_temp.q('i_binge', 'interests', 'multi', 27::smallint,
  'What you binge (pick up to 3)', 'shows & media',
  array['drama|Drama series|', 'anime|Anime|', 'docs|Documentaries|', 'comedy|Comedy|', 'true_crime|True crime|',
        'sports_tv|Sports|', 'reality|Reality TV|', 'podcasts|Podcasts|'],
  null, 3::smallint);
select pg_temp.q('i_shared_hobbies', 'interests', 'scale', 28::smallint,
  'Sharing hobbies with a partner matters a lot to me.', 'shared hobbies', pg_temp.scale());

-- --------------------------------------------------------------------- Values
select pg_temp.q('v_family', 'values', 'single', 29::smallint,
  'Family''s role in your life', 'family',
  array['central|Central to everything|', 'important|Important, with balance|', 'independent|I''m fairly independent|'],
  '{"default": 0.4, "pairs": {"central:important": 0.7, "important:independent": 0.65, "central:independent": 0.15}}');
select pg_temp.q('v_faith', 'values', 'single', 30::smallint,
  'Faith or spirituality in a relationship', 'faith & spirituality',
  array['same_essential|Sharing the same faith is essential|', 'important|Important to me|', 'open|I''m open|', 'not_important|Not important to me|'],
  '{"default": 0.4, "pairs": {"same_essential:important": 0.7, "important:open": 0.65, "open:not_important": 0.8, "same_essential:not_important": 0.05, "same_essential:open": 0.35}}');
select pg_temp.q('v_money', 'values', 'single', 31::smallint,
  'Your money style', 'money habits',
  array['saver|Saver|', 'balanced|Balanced|', 'spender|Treat-yourself spender|'],
  '{"default": 0.4, "pairs": {"saver:balanced": 0.75, "balanced:spender": 0.7, "saver:spender": 0.2}}');
select pg_temp.q('v_ambition', 'values', 'scale', 32::smallint,
  'Career ambition is a big part of who I am.', 'ambition', pg_temp.scale());
select pg_temp.q('v_kids', 'values', 'single', 33::smallint,
  'Kids in the future?', 'kids',
  array['want|I want kids|', 'open|Open to it|', 'unsure|Not sure yet|', 'dont_want|I don''t want kids|', 'have|I have kids|'],
  '{"default": 0.4, "pairs": {"want:open": 0.8, "want:unsure": 0.5, "want:dont_want": 0, "open:unsure": 0.75, "open:dont_want": 0.35, "unsure:dont_want": 0.5, "have:want": 0.6, "have:open": 0.75, "have:dont_want": 0.2}}');
select pg_temp.q('v_equal_share', 'values', 'scale', 34::smallint,
  'Partners should share household responsibilities equally.', 'sharing responsibilities', pg_temp.scale());
select pg_temp.q('v_honesty', 'values', 'single', 35::smallint,
  'If the truth would hurt, you…', 'honesty',
  array['always_truth|Say it straight|', 'gentle_truth|Say it gently|', 'protect|Protect their feelings|'],
  '{"default": 0.4, "pairs": {"always_truth:gentle_truth": 0.75, "gentle_truth:protect": 0.6, "always_truth:protect": 0.15}}');

-- --------------------------------------------------------------- Expectations
select pg_temp.q('e_looking_for', 'expectations', 'single', 36::smallint,
  'What are you looking for right now?', 'what you''re looking for',
  array['long_term|A long-term partner|', 'long_term_open|Long-term, open to short|', 'short_term_open|Short-term, open to long|',
        'new_friends|New friends|', 'figuring_out|Still figuring it out|'],
  '{"default": 0.3, "pairs": {"long_term:long_term_open": 0.85, "long_term_open:short_term_open": 0.7, "long_term:short_term_open": 0.35, "long_term:new_friends": 0.1, "figuring_out:long_term_open": 0.6, "figuring_out:short_term_open": 0.65, "figuring_out:new_friends": 0.6, "figuring_out:long_term": 0.4}}');
select pg_temp.q('e_pace', 'expectations', 'single', 37::smallint,
  'Your ideal pace for a new relationship', 'pace',
  array['slow|Slow and steady|', 'steady|Natural rhythm|', 'fast|When it''s right, it''s right|'],
  '{"default": 0.4, "pairs": {"slow:steady": 0.75, "steady:fast": 0.7, "slow:fast": 0.15}}');
select pg_temp.q('e_marriage', 'expectations', 'single', 38::smallint,
  'Marriage someday?', 'marriage',
  array['yes_soon|Yes, in the next few years|', 'yes_someday|Yes, someday|', 'open|Open to it|', 'no|Not for me|'],
  '{"default": 0.3, "pairs": {"yes_soon:yes_someday": 0.7, "yes_someday:open": 0.8, "open:no": 0.5, "yes_soon:open": 0.45, "yes_soon:no": 0, "yes_someday:no": 0.15}}');
select pg_temp.q('e_space', 'expectations', 'scale', 39::smallint,
  'I need a lot of personal space in a relationship.', 'personal space', pg_temp.scale());
select pg_temp.q('e_long_distance', 'expectations', 'single', 40::smallint,
  'Open to long distance?', 'long distance',
  array['yes|Yes|', 'maybe|For the right person|', 'no|No|'],
  '{"default": 0.4, "pairs": {"yes:maybe": 0.8, "maybe:no": 0.6, "yes:no": 0.3}}');
select pg_temp.q('e_exclusivity', 'expectations', 'single', 41::smallint,
  'When should things become exclusive?', 'exclusivity',
  array['early|Early on|', 'later|After getting to know each other|', 'non_exclusive|I prefer non-exclusive|'],
  '{"default": 0.4, "pairs": {"early:later": 0.75, "later:non_exclusive": 0.3, "early:non_exclusive": 0}}');
select pg_temp.q('e_meet_soon', 'expectations', 'scale', 42::smallint,
  'I''d like to meet in person within the first week of chatting.', 'meeting up', pg_temp.scale());
