-- AMEDSPOR — 0004 Tahmin oyunları, bilgi yarışması, rozetler, liderlik tablosu
-- Gerçek para, bahis, nakit ödül YOKTUR. Puanlar yalnızca eğlence amaçlıdır.

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  home_score smallint not null check (home_score between 0 and 20),
  away_score smallint not null check (away_score between 0 and 20),
  first_scorer_id uuid references public.players (id) on delete set null,
  motm_player_id uuid references public.players (id) on delete set null,
  points integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, user_id)
);
create index predictions_user_idx on public.predictions (user_id, created_at desc);
create trigger predictions_updated_at before update on public.predictions
  for each row execute function public.set_updated_at();

-- Puan defteri (kaynağı belli her puan hareketi)
create table public.prediction_points (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('prediction', 'quiz', 'admin')),
  source_id uuid not null,
  points integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index prediction_points_user_idx on public.prediction_points (user_id);

create table public.badges (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text not null,
  icon text not null default 'award'
);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_code text not null references public.badges (code) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  quiz_date date not null unique,
  question text not null check (char_length(question) between 5 and 300),
  options text[] not null check (array_length(options, 1) between 2 and 6),
  correct_index smallint not null,
  explanation text not null default '',
  source_url text,
  points integer not null default 3 check (points between 1 and 10),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (correct_index >= 0 and correct_index < array_length(options, 1))
);

create table public.quiz_answers (
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer_index smallint not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (quiz_id, user_id)
);

-- Tahminler maç başlamadan önce kilitlenir (sunucu saatiyle).
create or replace function public.guard_prediction()
returns trigger
language plpgsql
as $$
begin
  if public.is_service() then
    return new;
  end if;
  if not exists (
    select 1 from public.matches m
    where m.id = new.match_id and m.status = 'scheduled' and m.kickoff_at > now()
  ) then
    raise exception 'Bu maç için tahmin süresi doldu' using errcode = '42501';
  end if;
  new.points := null;
  return new;
end;
$$;
create trigger predictions_guard before insert or update on public.predictions
  for each row execute function public.guard_prediction();

-- Puanlama kuralları (tek kaynak burasıdır):
--   Tam skor: 5 | Doğru sonuç (G/B/M): 2 | İlk golü atan: 2 | Maçın oyuncusu: 1
create or replace function public.score_prediction(
  p_home smallint, p_away smallint, a_home smallint, a_away smallint,
  p_scorer uuid, a_scorer uuid, p_motm uuid, a_motm uuid)
returns integer
language sql
immutable
as $$
  select
    (case when p_home = a_home and p_away = a_away then 5
          when sign(p_home - p_away) = sign(a_home - a_away) then 2
          else 0 end)
    + (case when p_scorer is not null and p_scorer = a_scorer then 2 else 0 end)
    + (case when p_motm is not null and p_motm = a_motm then 1 else 0 end);
$$;

-- Maç bittiğinde editör çağırır. İdempotent: aynı maç iki kez puanlanmaz.
create or replace function public.settle_match_predictions(p_match_id uuid, p_motm uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  scorer uuid;
  settled integer := 0;
begin
  if not (public.is_service_request() or public.has_role('editor')) then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if m.id is null or m.status <> 'finished' or m.home_score is null or m.away_score is null then
    raise exception 'Maç bitmemiş veya skor girilmemiş';
  end if;
  if m.predictions_settled_at is not null then
    return 0;
  end if;

  select e.player_id into scorer from public.match_events e
  where e.match_id = p_match_id and e.type in ('goal', 'penalty_goal')
  order by e.minute, coalesce(e.extra_minute, 0), e.created_at
  limit 1;

  update public.predictions pr
  set points = public.score_prediction(pr.home_score, pr.away_score, m.home_score, m.away_score,
                                       pr.first_scorer_id, scorer, pr.motm_player_id, p_motm)
  where pr.match_id = p_match_id;
  get diagnostics settled = row_count;

  insert into public.prediction_points (user_id, source, source_id, points)
  select pr.user_id, 'prediction', pr.id, pr.points from public.predictions pr
  where pr.match_id = p_match_id and pr.points > 0
  on conflict do nothing;

  update public.profiles p set points = p.points + pr.points
  from public.predictions pr
  where pr.match_id = p_match_id and pr.user_id = p.id and pr.points > 0;

  insert into public.user_badges (user_id, badge_code)
  select pr.user_id, 'tam_isabet' from public.predictions pr
  where pr.match_id = p_match_id and pr.home_score = m.home_score and pr.away_score = m.away_score
  on conflict do nothing;

  update public.matches set predictions_settled_at = now() where id = p_match_id;
  return settled;
end;
$$;

-- Bilgi yarışması cevabı: doğruluğu sunucu hesaplar, istemci 'is_correct' gönderemez.
create or replace function public.answer_quiz(p_quiz_id uuid, p_answer smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quizzes;
  me uuid := auth.uid();
  correct boolean;
begin
  if me is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  select * into q from public.quizzes where id = p_quiz_id;
  if q.id is null or q.quiz_date > (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'Yarışma bulunamadı';
  end if;
  correct := (p_answer = q.correct_index);
  insert into public.quiz_answers (quiz_id, user_id, answer_index, is_correct)
  values (p_quiz_id, me, p_answer, correct);
  if correct then
    insert into public.prediction_points (user_id, source, source_id, points)
    values (me, 'quiz', p_quiz_id, q.points);
    update public.profiles set points = points + q.points where id = me;
  end if;
  insert into public.user_badges (user_id, badge_code) values (me, 'ilk_yarisma')
  on conflict do nothing;
  return correct;
end;
$$;

-- İlk tahmin rozeti
create or replace function public.predictions_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_badges (user_id, badge_code) values (new.user_id, 'ilk_tahmin')
  on conflict do nothing;
  return new;
end;
$$;
create trigger predictions_after_insert after insert on public.predictions
  for each row execute function public.predictions_badge();

insert into public.badges (code, name, description, icon) values
  ('ilk_tahmin', 'İlk Tahmin', 'İlk maç tahminini yaptın.', 'target'),
  ('tam_isabet', 'Tam İsabet', 'Bir maçın skorunu birebir bildin.', 'crosshair'),
  ('ilk_yarisma', 'Bilgi Yarışmacısı', 'İlk günlük bilgi yarışmasına katıldın.', 'brain'),
  ('premium_taraftar', 'Premium Taraftar', 'AMEDSPOR Premium ile platformu destekledin.', 'crown')
on conflict do nothing;

-- Liderlik tablosu
create or replace view public.leaderboard
with (security_invoker = true) as
select p.id as user_id, p.username, p.display_name, p.avatar_url, p.points,
       rank() over (order by p.points desc) as rank
from public.profiles p
where p.status = 'active' and p.points > 0;

-- Quiz'in doğru cevabı istemciye gitmesin diye ayrı görünüm
create or replace view public.quizzes_public
with (security_invoker = false) as
select id, quiz_date, question, options, points, source_url
from public.quizzes
where quiz_date <= (now() at time zone 'Europe/Istanbul')::date;

alter table public.predictions enable row level security;
alter table public.prediction_points enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_answers enable row level security;

create policy predictions_select on public.predictions for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.matches m where m.id = match_id and m.kickoff_at <= now())
  );
create policy predictions_insert on public.predictions for insert with check (user_id = auth.uid());
create policy predictions_update on public.predictions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy prediction_points_select on public.prediction_points for select using (user_id = auth.uid());
create policy badges_read on public.badges for select using (true);
create policy user_badges_read on public.user_badges for select using (true);
create policy quizzes_editor on public.quizzes for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy quiz_answers_select on public.quiz_answers for select using (user_id = auth.uid());

grant select on public.predictions, public.badges, public.user_badges, public.leaderboard, public.quizzes_public to anon, authenticated;
grant insert on public.predictions to authenticated;
grant update (home_score, away_score, first_scorer_id, motm_player_id) on public.predictions to authenticated;
grant select on public.prediction_points, public.quiz_answers to authenticated;
grant select, insert, update, delete on public.quizzes to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.answer_quiz(uuid, smallint) to authenticated;
grant execute on function public.settle_match_predictions(uuid, uuid) to authenticated;
