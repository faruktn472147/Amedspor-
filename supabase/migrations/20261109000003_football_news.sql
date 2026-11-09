-- AMEDSPOR — 0003 Futbol verisi ve haber ağı
-- Tüm futbol verisi bir kaynağa (source_url / source_name) bağlanır. Uydurma veri yoktur:
-- veri girilmemişse arayüz "veri yok" gösterir.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  short_name text check (char_length(short_name) <= 10),
  is_amedspor boolean not null default false,
  logo_url text,
  created_at timestamptz not null default now()
);
create unique index teams_single_amedspor on public.teams (is_amedspor) where is_amedspor;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  shirt_number smallint check (shirt_number between 1 and 99),
  position text check (position in ('Kaleci', 'Defans', 'Orta Saha', 'Forvet')),
  nationality text,
  birth_date date,
  photo_url text,
  photo_credit text,
  bio text not null default '',
  career jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  source_name text,
  source_url text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index players_team_idx on public.players (team_id, shirt_number);
create trigger players_updated_at before update on public.players
  for each row execute function public.set_updated_at();

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition text not null check (char_length(competition) <= 80),
  season text not null check (season ~ '^[0-9]{4}-[0-9]{2,4}$'),
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  kickoff_at timestamptz not null,
  venue text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled')),
  minute smallint check (minute between 0 and 130),
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  stats jsonb not null default '{}'::jsonb,
  source_name text,
  source_url text,
  verified boolean not null default false,
  predictions_settled_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);
create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_status_idx on public.matches (status) where status in ('live', 'halftime');
create trigger matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid references public.teams (id),
  player_id uuid references public.players (id) on delete set null,
  related_player_id uuid references public.players (id) on delete set null,
  player_name text,
  type text not null check (type in ('goal', 'own_goal', 'penalty_goal', 'penalty_miss', 'yellow', 'second_yellow', 'red', 'substitution', 'var', 'note')),
  minute smallint not null check (minute between 0 and 130),
  extra_minute smallint check (extra_minute between 0 and 30),
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index match_events_match_idx on public.match_events (match_id, minute, created_at);

create table public.match_lineups (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id),
  is_starter boolean not null,
  shirt_number smallint,
  position text,
  primary key (match_id, player_id)
);

create table public.player_statistics (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  season text not null,
  competition text not null,
  appearances smallint not null default 0 check (appearances >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  goals smallint not null default 0 check (goals >= 0),
  assists smallint not null default 0 check (assists >= 0),
  yellow_cards smallint not null default 0 check (yellow_cards >= 0),
  red_cards smallint not null default 0 check (red_cards >= 0),
  source_name text,
  source_url text,
  updated_at timestamptz not null default now(),
  unique (player_id, season, competition)
);

-- Taraftar puanı (maç bazında 1-10)
create table public.player_ratings (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  primary key (match_id, player_id, user_id)
);
create index player_ratings_player_idx on public.player_ratings (player_id);

-- ---------------------------------------------------------------------------
-- Haber ağı
-- ---------------------------------------------------------------------------
create table public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  homepage_url text not null,
  feed_url text,
  kind text not null check (kind in ('official_club', 'official_social', 'federation', 'media', 'journalist', 'aggregator')),
  trust_level text not null default 'review' check (trust_level in ('official', 'trusted', 'review')),
  auto_publish boolean not null default false,
  keywords text[] not null default array['amedspor', 'amed sportif', 'amed sk'],
  is_active boolean not null default true,
  -- Kaynağın içeriğini yeniden yayınlama izni var mı? Yoksa yalnızca başlık+özet+bağlantı.
  republish_allowed boolean not null default false,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.news (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources (id) on delete set null,
  title text not null check (char_length(title) between 5 and 300),
  summary text not null default '' check (char_length(summary) <= 1200),
  body text not null default '' check (char_length(body) <= 20000),
  original_url text,
  image_url text,
  image_credit text,
  category text not null default 'haber' check (category in ('son_dakika', 'resmi', 'haber', 'transfer', 'mac', 'roportaj')),
  verification text not null default 'unverified'
    check (verification in ('official', 'verified', 'unverified', 'rumor')),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'removed')),
  is_sensitive boolean not null default false,
  published_at timestamptz,
  source_published_at timestamptz,
  author_id uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null),
  -- Kaynaksız haber yayınlanamaz: ya bir kaynak ya da özgün URL olmalı (veya editör yazısı)
  check (status <> 'published' or source_id is not null or original_url is not null or author_id is not null)
);
create index news_published_idx on public.news (published_at desc) where status = 'published';
create index news_pending_idx on public.news (created_at) where status = 'pending';
create trigger news_updated_at before update on public.news
  for each row execute function public.set_updated_at();

-- İçerik sayfaları (Amedspor tarihi vb.) — yönetici tarafından kaynaklı olarak girilir.
create table public.content_pages (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null,
  body text not null default '',
  sources jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.match_lineups enable row level security;
alter table public.player_statistics enable row level security;
alter table public.player_ratings enable row level security;
alter table public.news_sources enable row level security;
alter table public.news enable row level security;
alter table public.content_pages enable row level security;

create policy teams_read on public.teams for select using (true);
create policy players_read on public.players for select using (true);
create policy matches_read on public.matches for select using (true);
create policy match_events_read on public.match_events for select using (true);
create policy match_lineups_read on public.match_lineups for select using (true);
create policy player_statistics_read on public.player_statistics for select using (true);
create policy player_ratings_read on public.player_ratings for select using (true);

-- Taraftar puanı: yalnızca maç başladıktan sonra, kendi adına, bir kez.
create policy player_ratings_insert on public.player_ratings for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.matches m where m.id = match_id and m.status in ('live', 'halftime', 'finished'))
  );

-- Editörler futbol verisini yönetir
create policy teams_write on public.teams for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy players_write on public.players for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy matches_write on public.matches for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy match_events_write on public.match_events for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy match_lineups_write on public.match_lineups for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy player_statistics_write on public.player_statistics for all using (public.has_role('editor')) with check (public.has_role('editor'));

create policy news_sources_read on public.news_sources for select using (is_active or public.has_role('editor'));
create policy news_sources_write on public.news_sources for all using (public.has_role('admin')) with check (public.has_role('admin'));

create policy news_read on public.news for select using (status = 'published' or public.has_role('editor'));
create policy news_write on public.news for all using (public.has_role('editor')) with check (public.has_role('editor'));

create policy content_pages_read on public.content_pages for select using (is_published or public.has_role('editor'));
create policy content_pages_write on public.content_pages for all using (public.has_role('editor')) with check (public.has_role('editor'));

grant select on public.teams, public.players, public.matches, public.match_events, public.match_lineups,
  public.player_statistics, public.player_ratings, public.news_sources, public.news, public.content_pages
  to anon, authenticated;
grant insert, update, delete on public.teams, public.players, public.matches, public.match_events,
  public.match_lineups, public.player_statistics, public.news_sources, public.news, public.content_pages
  to authenticated;
grant insert on public.player_ratings to authenticated;
grant all on all tables in schema public to service_role;
