-- =============================================================================
-- SPARK 0003 — Chemistry questionnaire, answers and results
-- =============================================================================
-- Scoring is backend-authoritative (src/lib/chemistry/engine.ts, run on the
-- server). Clients can write their OWN answers only; results are written by the
-- trusted server (service role) and are never client-writable.
-- =============================================================================

create table public.chemistry_questions (
  id                     uuid primary key default gen_random_uuid(),
  questionnaire_version  smallint not null check (questionnaire_version > 0),
  code                   text not null,
  dimension              text not null check (dimension in
                           ('personality', 'communication', 'lifestyle', 'interests', 'values', 'expectations')),
  kind                   text not null check (kind in ('scale', 'single', 'multi')),
  prompt                 text not null,
  short_label            text not null,       -- used in explanations ("weekend plans")
  max_choices            smallint not null default 1 check (max_choices between 1 and 5),
  weight                 numeric(4,2) not null default 1 check (weight > 0),
  -- For 'single': {"default": 0.2, "pairs": {"a:b": 0.6}}; identical keys always score 1.
  compat_matrix          jsonb,
  position               smallint not null,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (questionnaire_version, code),
  unique (questionnaire_version, position)
);
create trigger chemistry_questions_updated_at before update on public.chemistry_questions
  for each row execute function private.set_updated_at();

create table public.chemistry_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.chemistry_questions (id) on delete cascade,
  key          text not null check (key ~ '^[a-z0-9_]+$'),
  label        text not null,
  value        numeric(6,2),                  -- numeric value for 'scale' questions
  position     smallint not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (question_id, key)
);
create trigger chemistry_options_updated_at before update on public.chemistry_options
  for each row execute function private.set_updated_at();
create index chemistry_options_question_idx on public.chemistry_options (question_id, position);

alter table public.chemistry_questions enable row level security;
alter table public.chemistry_options enable row level security;
revoke all on public.chemistry_questions, public.chemistry_options from anon, authenticated;
grant select on public.chemistry_questions, public.chemistry_options to authenticated;
create policy "questions: signed-in read" on public.chemistry_questions for select to authenticated using (is_active);
create policy "options: signed-in read" on public.chemistry_options for select to authenticated using (true);

-- Answers (private to their owner) ---------------------------------------------
create table public.chemistry_answers (
  user_id                uuid not null references public.profiles (id) on delete cascade,
  question_id            uuid not null references public.chemistry_questions (id) on delete cascade,
  questionnaire_version  smallint not null,
  option_keys            text[] not null check (cardinality(option_keys) between 1 and 5),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (user_id, question_id)
);
create trigger chemistry_answers_updated_at before update on public.chemistry_answers
  for each row execute function private.set_updated_at();
create index chemistry_answers_user_version_idx on public.chemistry_answers (user_id, questionnaire_version);

-- Validate answers against the question definition (keys exist, choice count).
create or replace function private.validate_chemistry_answer()
returns trigger language plpgsql set search_path = '' as $$
declare
  q public.chemistry_questions;
  v_valid integer;
begin
  select * into q from public.chemistry_questions where id = new.question_id;
  if not found or not q.is_active then
    raise exception 'Unknown question' using errcode = '23503';
  end if;
  new.questionnaire_version := q.questionnaire_version;
  new.option_keys := array(select distinct unnest(new.option_keys) order by 1);
  if q.kind in ('scale', 'single') and cardinality(new.option_keys) <> 1 then
    raise exception 'Exactly one option required' using errcode = '23514';
  end if;
  if cardinality(new.option_keys) > q.max_choices then
    raise exception 'Too many options selected' using errcode = '23514';
  end if;
  select count(*) into v_valid from public.chemistry_options o
   where o.question_id = q.id and o.key = any (new.option_keys);
  if v_valid <> cardinality(new.option_keys) then
    raise exception 'Invalid option' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger chemistry_answers_validate before insert or update on public.chemistry_answers
  for each row execute function private.validate_chemistry_answer();

alter table public.chemistry_answers enable row level security;
revoke all on public.chemistry_answers from anon, authenticated;
grant select, insert, update (option_keys), delete on public.chemistry_answers to authenticated;
create policy "answers: owner reads" on public.chemistry_answers for select to authenticated
  using (user_id = (select auth.uid()));
create policy "answers: owner inserts" on public.chemistry_answers for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "answers: owner updates" on public.chemistry_answers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "answers: owner deletes" on public.chemistry_answers for delete to authenticated
  using (user_id = (select auth.uid()));

-- Pairwise results (server-written) ---------------------------------------------
create table public.chemistry_results (
  id                     uuid primary key default gen_random_uuid(),
  user_low               uuid not null references public.profiles (id) on delete cascade,
  user_high              uuid not null references public.profiles (id) on delete cascade,
  questionnaire_version  smallint not null,
  calculation_version    smallint not null,
  overall_score          numeric(5,2) not null check (overall_score between 0 and 100),
  confidence             numeric(4,3) not null check (confidence between 0 and 1),
  explanations           jsonb not null default '[]'::jsonb,
  shared_interest_count  smallint not null default 0,
  calculated_at          timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint chemistry_results_ordered check (user_low < user_high),
  unique (user_low, user_high, questionnaire_version, calculation_version)
);
create trigger chemistry_results_updated_at before update on public.chemistry_results
  for each row execute function private.set_updated_at();
create index chemistry_results_high_idx on public.chemistry_results (user_high);

create table public.chemistry_result_dimensions (
  result_id   uuid not null references public.chemistry_results (id) on delete cascade,
  dimension   text not null check (dimension in
                ('personality', 'communication', 'lifestyle', 'interests', 'values', 'expectations')),
  score       numeric(5,2) not null check (score between 0 and 100),
  raw_similarity numeric(5,4),
  coverage    numeric(4,3) not null check (coverage between 0 and 1),
  weight      numeric(4,3) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (result_id, dimension)
);
create trigger chemistry_result_dimensions_updated_at before update on public.chemistry_result_dimensions
  for each row execute function private.set_updated_at();

alter table public.chemistry_results enable row level security;
alter table public.chemistry_result_dimensions enable row level security;
revoke all on public.chemistry_results, public.chemistry_result_dimensions from anon, authenticated;
grant select on public.chemistry_results, public.chemistry_result_dimensions to authenticated;
create policy "results: pair members read" on public.chemistry_results for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));
create policy "result dims: pair members read" on public.chemistry_result_dimensions for select to authenticated
  using (exists (select 1 from public.chemistry_results r
                 where r.id = result_id and (select auth.uid()) in (r.user_low, r.user_high)));
