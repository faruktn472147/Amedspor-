-- ============================================================================
-- AMEDSPOR — TEK DOSYA VERİTABANI KURULUMU
-- Bu dosya otomatik üretilir (scripts/build-setup-sql.mjs); elle düzenlemeyin.
--
-- NASIL KULLANILIR:
--   1) supabase.com → projeniz → sol menüde "SQL Editor" → "New query"
--   2) Bu dosyanın TAMAMINI kopyalayıp yapıştırın
--   3) Sağ alttaki "Run" düğmesine basın → "Success. No rows returned" görmelisiniz
--
-- Yalnızca YENİ (boş) bir projede BİR KEZ çalıştırın. Tüm adımlar tek işlemde
-- yapılır: bir hata olursa hiçbir şey yarım kalmaz.
-- İçerik: 9 migration (20261109000001_core.sql … 20261109000009_privacy_hardening.sql)
-- ============================================================================
begin;
create schema if not exists amed_meta;
create table if not exists amed_meta.applied (name text primary key, applied_at timestamptz not null default now());
revoke all on schema amed_meta from public;

-- ---------------------------------------------------------------------------
-- 20261109000001_core.sql
-- ---------------------------------------------------------------------------
-- AMEDSPOR — 0001 Çekirdek: profiller, roller, yardımcı fonksiyonlar, denetim kaydı
-- Supabase (PostgreSQL 15+) için yazılmıştır. Tüm tablolarda RLS açıktır.
-- Not: 30 Mayıs 2026 sonrası açılan Supabase projelerinde PostgREST erişimi için
-- açık GRANT gerekir; bu yüzden her tablo için izinler aşağıda açıkça verilmiştir.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------

-- Ayrıcalıklı bağlamda mı çalışılıyor? (service_role, veritabanı sahibi veya
-- güvenilir bir SECURITY DEFINER fonksiyonunun içinden tetiklenen tetikleyici)
-- DİKKAT: Bu yalnızca TETİKLEYİCİLERDE kullanılır. SECURITY DEFINER fonksiyonların
-- içinde current_user her zaman sahip olduğundan yetki kontrolü için
-- is_service_request() kullanılmalıdır.
create or replace function public.is_service()
returns boolean
language sql
stable
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin');
$$;

-- İsteğin kendisi service_role anahtarıyla mı geldi? (JWT rolüne bakar)
create or replace function public.is_service_request()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    or (nullif(current_setting('request.jwt.claims', true), '') is null
        and session_user in ('postgres', 'supabase_admin'));
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiller
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique
    check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null default ''
    check (char_length(display_name) <= 50),
  bio text not null default '' check (char_length(bio) <= 300),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  is_private boolean not null default false,
  data_saver boolean not null default false,
  personalized_ads boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'banned')),
  followers_count integer not null default 0,
  following_count integer not null default 0,
  posts_count integer not null default 0,
  points integer not null default 0,
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Kullanıcı yalnızca bu sütunları doğrudan değiştirebilir. Kullanıcı adı ve
-- biyografi gibi metin alanları moderasyondan geçmek zorunda olduğu için
-- yalnızca sunucu (service_role) üzerinden güncellenir.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_service() then
    return new;
  end if;
  if new.username is distinct from old.username
     or new.display_name is distinct from old.display_name
     or new.bio is distinct from old.bio
     or new.status is distinct from old.status
     or new.followers_count is distinct from old.followers_count
     or new.following_count is distinct from old.following_count
     or new.posts_count is distinct from old.posts_count
     or new.points is distinct from old.points
     or new.accepted_terms_at is distinct from old.accepted_terms_at
     or new.id is distinct from old.id then
    raise exception 'Bu alan yalnızca sunucu üzerinden güncellenebilir'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Yeni kullanıcı kaydında otomatik profil oluşturma.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n integer := 0;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'taraftar'),
    '[^a-zA-Z0-9_.]', '', 'g'));
  if char_length(base) < 3 then
    base := 'taraftar' || base;
  end if;
  base := left(base, 20);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 20) || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, accepted_terms_at)
  values (
    new.id,
    candidate,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 50),
    case when (new.raw_user_meta_data ->> 'accepted_terms') = 'true' then now() else null end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Roller (yönetim yetkileri yalnızca sunucu tarafında tanımlanır)
-- ---------------------------------------------------------------------------
create table public.admin_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator', 'editor')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Platformda yalnızca tek bir sahip (owner) olabilir.
create unique index admin_roles_single_owner on public.admin_roles (role)
  where role = 'owner';

create or replace function public.has_role(required text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_roles r
    where r.user_id = uid
      and (
        r.role = required
        or r.role = 'owner'
        or (r.role = 'admin' and required in ('moderator', 'editor'))
      )
  );
$$;

-- Finansal işlemler: sahip + iki aşamalı doğrulama (aal2) gerekir.
create or replace function public.is_owner_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_roles r
    where r.user_id = auth.uid() and r.role = 'owner'
  )
  and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- ---------------------------------------------------------------------------
-- Engelleme / sessize alma (görünürlük fonksiyonları bunlara ihtiyaç duyar)
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.mutes (
  muter_id uuid not null references public.profiles (id) on delete cascade,
  muted_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Görüntüleyen kişi bu profilin içeriklerini görebilir mi?
create or replace function public.can_view_profile(owner uuid, viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when viewer is not null and viewer = owner then true
      when viewer is not null and public.is_blocked_between(owner, viewer) then false
      when not exists (select 1 from public.profiles p where p.id = owner and p.status = 'active') then false
      when exists (select 1 from public.profiles p where p.id = owner and not p.is_private) then true
      when viewer is null then false
      else exists (select 1 from public.follows f where f.follower_id = viewer and f.following_id = owner)
    end;
$$;

-- ---------------------------------------------------------------------------
-- Denetim kaydı (yönetici işlemleri)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Basit, ücretsiz hız sınırlama (rate limit)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits)
  values (p_key, ws, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into current_hits;
  -- eski pencereleri arada bir temizle
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return current_hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.follows enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;

-- Profil kartları (ad, avatar) herkese açıktır; özel hesabın İÇERİĞİ gizlidir.
-- Engellenen kullanıcılar birbirinin profilini göremez.
create policy profiles_select on public.profiles for select
  using (
    status = 'active' and (auth.uid() is null or not public.is_blocked_between(id, auth.uid()))
    or id = auth.uid()
    or public.has_role('moderator')
  );
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy admin_roles_select on public.admin_roles for select
  using (user_id = auth.uid() or public.has_role('admin'));
-- admin_roles üzerinde istemci yazma politikası YOK: roller yalnızca service_role ile verilir.

create policy blocks_select on public.blocks for select using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete using (blocker_id = auth.uid());

create policy mutes_select on public.mutes for select using (muter_id = auth.uid());
create policy mutes_insert on public.mutes for insert with check (muter_id = auth.uid());
create policy mutes_delete on public.mutes for delete using (muter_id = auth.uid());

create policy follows_select on public.follows for select
  using (
    follower_id = auth.uid() or following_id = auth.uid()
    or (public.can_view_profile(following_id) and public.can_view_profile(follower_id))
  );
-- Doğrudan takip yalnızca herkese açık hesaplar için. Özel hesaplar takip isteği ile.
create policy follows_insert on public.follows for insert
  with check (
    follower_id = auth.uid()
    and not public.is_blocked_between(follower_id, following_id)
    and exists (select 1 from public.profiles p where p.id = following_id and not p.is_private and p.status = 'active')
  );
create policy follows_delete on public.follows for delete
  using (follower_id = auth.uid() or following_id = auth.uid());

create policy audit_logs_select on public.audit_logs for select using (public.has_role('admin'));

-- Kullanıcının kendi profilinin tamamı (kişisel ayarlar dahil)
create or replace function public.get_my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Sayaç tetikleyicileri
-- ---------------------------------------------------------------------------
create or replace function public.follows_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    return new;
  else
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    return old;
  end if;
end;
$$;
create trigger follows_count after insert or delete on public.follows
  for each row execute function public.follows_counter();

-- Engelleme yapıldığında karşılıklı takipleri kaldır.
create or replace function public.blocks_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_after_insert after insert on public.blocks
  for each row execute function public.blocks_cleanup();

-- ---------------------------------------------------------------------------
-- İzinler
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
-- Kişisel ayarlar (reklam izni, veri tasarrufu, şartları kabul tarihi) herkese açık DEĞİLDİR.
grant select (id, username, display_name, bio, avatar_url, is_private, status,
  followers_count, following_count, posts_count, points, created_at) on public.profiles to anon, authenticated;
grant update (is_private, data_saver, personalized_ads, avatar_url) on public.profiles to authenticated;
grant select on public.admin_roles to authenticated;
grant select, insert, delete on public.blocks, public.mutes to authenticated;
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
grant select on public.audit_logs to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.has_role(text, uuid), public.can_view_profile(uuid, uuid),
  public.is_blocked_between(uuid, uuid), public.is_owner_aal2() to anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
insert into amed_meta.applied (name) values ('20261109000001_core.sql');

-- ---------------------------------------------------------------------------
-- 20261109000002_social.sql
-- ---------------------------------------------------------------------------
-- AMEDSPOR — 0002 Sosyal medya: gönderiler, medya, yorumlar, beğeniler, kayıtlar,
-- takip istekleri, anketler, bildirimler, şikâyetler, moderasyon, itirazlar

create table public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index follow_requests_target_idx on public.follow_requests (target_id, created_at desc);

-- Moderasyon durumları:
--  approved : yayında
--  pending  : incelemede (otomatik filtre şüphelendi veya doğrudan API ile eklendi)
--  rejected : reddedildi (yalnızca sahibi ve moderatör görür)
--  removed  : moderatör kaldırdı
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'post' check (kind in ('post', 'short', 'poll')),
  body text not null default '' check (char_length(body) <= 2200),
  moderation_status text not null default 'pending'
    check (moderation_status in ('approved', 'pending', 'rejected', 'removed')),
  moderation_reason text,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_feed_idx on public.posts (created_at desc) where moderation_status = 'approved';
create index posts_shorts_idx on public.posts (created_at desc) where kind = 'short' and moderation_status = 'approved';
create index posts_popular_idx on public.posts (like_count desc, created_at desc) where moderation_status = 'approved';
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null check (char_length(storage_path) <= 400),
  poster_path text,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 52428800),
  width integer,
  height integer,
  duration_seconds numeric(6, 2) check (duration_seconds is null or duration_seconds <= 90),
  position smallint not null default 0 check (position between 0 and 9),
  created_at timestamptz not null default now()
);
create index post_media_post_idx on public.post_media (post_id, position);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  moderation_status text not null default 'pending'
    check (moderation_status in ('approved', 'pending', 'rejected', 'removed')),
  moderation_reason text,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_recent_idx on public.comments (created_at desc) where moderation_status = 'approved';

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index likes_post_idx on public.likes (post_id);

create table public.bookmarks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- Anketler (gönderiye bağlı)
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  position smallint not null default 0,
  vote_count integer not null default 0
);
create index poll_options_post_idx on public.poll_options (post_id, position);

create table public.poll_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'like', 'comment', 'reply', 'follow', 'follow_request', 'follow_accepted',
    'moderation', 'system', 'match', 'news', 'badge', 'subscription')),
  post_id uuid references public.posts (id) on delete cascade,
  message text not null default '' check (char_length(message) <= 300),
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile', 'news')),
  target_id uuid not null,
  reason text not null check (reason in (
    'kufur', 'hakaret', 'tehdit', 'irkcilik', 'nefret', 'taciz', 'siddet',
    'spam', 'dolandiricilik', 'kisisel_bilgi', 'uygunsuz_gorsel', 'telif', 'diger')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_status_idx on public.reports (status, created_at);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'profile', 'news')),
  target_id uuid not null,
  target_owner_id uuid references public.profiles (id) on delete cascade,
  action text not null check (action in ('approve', 'reject', 'remove', 'restore', 'suspend', 'ban', 'unban', 'warn', 'auto_flag', 'auto_reject')),
  reason text not null default '',
  automated boolean not null default false,
  created_at timestamptz not null default now()
);
create index moderation_actions_owner_idx on public.moderation_actions (target_owner_id, created_at desc);

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.moderation_actions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Görünürlük
-- ---------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid, viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and (
        (p.author_id = viewer)
        or (p.moderation_status = 'approved' and public.can_view_profile(p.author_id, viewer))
        or public.has_role('moderator', viewer)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Tetikleyiciler
-- ---------------------------------------------------------------------------

-- İstemciden doğrudan eklenen içerik moderasyonu atlayamaz: her zaman 'pending'.
-- Sunucu (service_role) moderasyon filtresini çalıştırdıktan sonra durumu belirler.
create or replace function public.force_pending_for_clients()
returns trigger
language plpgsql
as $$
begin
  if not public.is_service() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'pending';
      new.moderation_reason := null;
    elsif new.moderation_status is distinct from old.moderation_status
       or new.body is distinct from old.body then
      raise exception 'İçerik yalnızca sunucu üzerinden düzenlenebilir' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger posts_force_pending before insert or update on public.posts
  for each row execute function public.force_pending_for_clients();
create trigger comments_force_pending before insert or update on public.comments
  for each row execute function public.force_pending_for_clients();

-- Gönderi sayacı
create or replace function public.posts_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
    return new;
  else
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = old.author_id;
    return old;
  end if;
end;
$$;
create trigger posts_count after insert or delete on public.posts
  for each row execute function public.posts_counter();

-- Beğeni sayacı + bildirim
create or replace function public.likes_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id returning author_id into author;
    if author is not null and author <> new.user_id then
      insert into public.notifications (user_id, actor_id, type, post_id, message, link)
      values (author, new.user_id, 'like', new.post_id, 'gönderini beğendi', '/gonderi/' || new.post_id);
    end if;
    return new;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;
create trigger likes_after_change after insert or delete on public.likes
  for each row execute function public.likes_after();

-- Yorum sayacı + bildirim (yalnızca onaylı yorumlar sayılır)
create or replace function public.comments_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  if tg_op = 'INSERT' and new.moderation_status = 'approved' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id
      returning author_id into post_author;
    if new.parent_id is not null then
      select author_id into parent_author from public.comments where id = new.parent_id;
      if parent_author is not null and parent_author <> new.author_id then
        insert into public.notifications (user_id, actor_id, type, post_id, message, link)
        values (parent_author, new.author_id, 'reply', new.post_id, 'yorumuna cevap verdi', '/gonderi/' || new.post_id);
      end if;
    end if;
    if post_author is not null and post_author <> new.author_id
       and post_author is distinct from parent_author then
      insert into public.notifications (user_id, actor_id, type, post_id, message, link)
      values (post_author, new.author_id, 'comment', new.post_id, 'gönderine yorum yaptı', '/gonderi/' || new.post_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.moderation_status <> 'approved' and new.moderation_status = 'approved' then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    elsif old.moderation_status = 'approved' and new.moderation_status <> 'approved' then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    end if;
  elsif tg_op = 'DELETE' and old.moderation_status = 'approved' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger comments_after_change after insert or update or delete on public.comments
  for each row execute function public.comments_after();

-- Takip bildirimi
create or replace function public.follows_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type, message, link)
  values (new.following_id, new.follower_id, 'follow', 'seni takip etmeye başladı', null);
  return new;
end;
$$;
create trigger follows_after_insert_notify after insert on public.follows
  for each row execute function public.follows_notify();

create or replace function public.follow_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type, message, link)
  values (new.target_id, new.requester_id, 'follow_request', 'seni takip etmek istiyor', '/bildirimler');
  return new;
end;
$$;
create trigger follow_requests_after_insert after insert on public.follow_requests
  for each row execute function public.follow_requests_notify();

-- Takip isteğini kabul et (yalnızca hedef kullanıcı)
create or replace function public.accept_follow_request(p_requester uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  delete from public.follow_requests where requester_id = p_requester and target_id = me;
  if not found then
    raise exception 'Takip isteği bulunamadı' using errcode = 'P0002';
  end if;
  insert into public.follows (follower_id, following_id) values (p_requester, me)
    on conflict do nothing;
  insert into public.notifications (user_id, actor_id, type, message)
    values (p_requester, me, 'follow_accepted', 'takip isteğini kabul etti');
end;
$$;

-- Anket oyu (tek oy, sayaç güncellemesi)
create or replace function public.poll_votes_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.poll_options set vote_count = vote_count + 1 where id = new.option_id;
  return new;
end;
$$;
create trigger poll_votes_after_insert after insert on public.poll_votes
  for each row execute function public.poll_votes_after();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.follow_requests enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.appeals enable row level security;

create policy follow_requests_select on public.follow_requests for select
  using (requester_id = auth.uid() or target_id = auth.uid());
create policy follow_requests_insert on public.follow_requests for insert
  with check (
    requester_id = auth.uid()
    and not public.is_blocked_between(requester_id, target_id)
    and exists (select 1 from public.profiles p where p.id = target_id and p.is_private)
  );
create policy follow_requests_delete on public.follow_requests for delete
  using (requester_id = auth.uid() or target_id = auth.uid());

create policy posts_select on public.posts for select
  using (
    author_id = auth.uid()
    or (moderation_status = 'approved' and public.can_view_profile(author_id))
    or public.has_role('moderator')
  );
create policy posts_insert on public.posts for insert with check (author_id = auth.uid());
-- Yalnızca sahibi silebilir (moderatör kaldırması 'removed' durumuyla sunucudan yapılır).
create policy posts_delete on public.posts for delete using (author_id = auth.uid());

create policy post_media_select on public.post_media for select
  using (public.can_view_post(post_id));
create policy post_media_insert on public.post_media for insert
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
    and storage_path like auth.uid()::text || '/%'
  );
create policy post_media_delete on public.post_media for delete using (owner_id = auth.uid());

create policy comments_select on public.comments for select
  using (
    public.can_view_post(post_id)
    and (author_id = auth.uid() or moderation_status = 'approved' or public.has_role('moderator'))
  );
create policy comments_insert on public.comments for insert
  with check (author_id = auth.uid() and public.can_view_post(post_id));
create policy comments_delete on public.comments for delete
  using (
    author_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy likes_select on public.likes for select using (public.can_view_post(post_id));
create policy likes_insert on public.likes for insert
  with check (user_id = auth.uid() and public.can_view_post(post_id));
create policy likes_delete on public.likes for delete using (user_id = auth.uid());

create policy bookmarks_select on public.bookmarks for select using (user_id = auth.uid());
create policy bookmarks_insert on public.bookmarks for insert
  with check (user_id = auth.uid() and public.can_view_post(post_id));
create policy bookmarks_delete on public.bookmarks for delete using (user_id = auth.uid());

create policy poll_options_select on public.poll_options for select using (public.can_view_post(post_id));
create policy poll_votes_select on public.poll_votes for select using (user_id = auth.uid());
create policy poll_votes_insert on public.poll_votes for insert
  with check (
    user_id = auth.uid()
    and public.can_view_post(post_id)
    and exists (select 1 from public.poll_options o where o.id = option_id and o.post_id = poll_votes.post_id)
  );

create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_select on public.reports for select
  using (reporter_id = auth.uid() or public.has_role('moderator'));

create policy moderation_actions_select on public.moderation_actions for select
  using (target_owner_id = auth.uid() or public.has_role('moderator'));

create policy appeals_select on public.appeals for select
  using (user_id = auth.uid() or public.has_role('moderator'));
create policy appeals_insert on public.appeals for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.moderation_actions a where a.id = action_id and a.target_owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- İzinler
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.follow_requests to authenticated;
grant select on public.posts, public.post_media, public.comments, public.likes, public.poll_options to anon, authenticated;
grant insert, delete on public.posts, public.post_media, public.comments to authenticated;
grant select, insert, delete on public.likes, public.bookmarks to authenticated;
grant select, insert on public.poll_votes to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert on public.reports, public.appeals to authenticated;
grant select on public.moderation_actions to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.can_view_post(uuid, uuid) to anon, authenticated;
grant execute on function public.accept_follow_request(uuid) to authenticated;
insert into amed_meta.applied (name) values ('20261109000002_social.sql');

-- ---------------------------------------------------------------------------
-- 20261109000003_football_news.sql
-- ---------------------------------------------------------------------------
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
insert into amed_meta.applied (name) values ('20261109000003_football_news.sql');

-- ---------------------------------------------------------------------------
-- 20261109000004_games.sql
-- ---------------------------------------------------------------------------
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
insert into amed_meta.applied (name) values ('20261109000004_games.sql');

-- ---------------------------------------------------------------------------
-- 20261109000005_monetization.sql
-- ---------------------------------------------------------------------------
-- AMEDSPOR — 0005 Gelir sistemi: ayarlar, Premium abonelik, ödemeler, webhook olayları,
-- banka aktarımları, reklam yerleşimleri, sponsor kampanyaları, reklam istatistikleri.
--
-- GÜVENLİK İLKELERİ
--  * Kart bilgisi hiçbir tabloda tutulmaz (ödeme kuruluşunun güvenli sayfası kullanılır).
--  * Abonelik ve ödeme satırlarını istemci ASLA yazamaz; yalnızca imzası doğrulanmış
--    webhook'ları işleyen sunucu (service_role) yazar.
--  * Finansal veriler yalnızca SAHİP hesabı + iki aşamalı doğrulama (aal2) ile okunur.

create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, is_public) values
  ('premium', jsonb_build_object(
      'price_try', 10, 'currency', 'TRY', 'interval', 'month',
      'tagline', 'AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca 10 TL.'
    ), true),
  -- İlk kurulumda reklam sıklığı bilinçli olarak DÜŞÜK tutulur.
  ('ads', jsonb_build_object(
      'enabled', true,
      'feed_first_after', 5,
      'feed_every', 10,
      'shorts_every', 15,
      'max_per_page', 2,
      'per_campaign_daily_cap', 3
    ), true),
  ('finance', jsonb_build_object(
      'estimated_fee_percent', 3.5,
      'estimated_fee_fixed_try', 0.25,
      'vat_percent', 20,
      'note', 'Tahmini oranlar yalnızca ödeme kuruluşu komisyonu bildirmediğinde kullanılır.'
    ), false)
on conflict do nothing;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null check (status in (
    'active',           -- Aktif
    'pending_payment',  -- Ödeme bekleniyor
    'payment_failed',   -- Ödeme başarısız
    'canceled',         -- İptal edildi (ödenmiş dönem sonuna kadar Premium sürer)
    'expired',          -- Süresi doldu
    'renewal_pending'   -- Yenileme bekleniyor
  )),
  provider text not null check (provider in ('test', 'iyzico', 'paytr')),
  provider_subscription_ref text,
  provider_customer_ref text,
  price_amount numeric(10, 2) not null check (price_amount >= 0),
  currency text not null default 'TRY',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_ref)
);
create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  provider text not null,
  provider_payment_ref text,
  checkout_token text unique,
  kind text not null check (kind in ('initial', 'renewal', 'refund')),
  status text not null check (status in ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  amount_gross numeric(12, 2) not null,
  -- Ödeme kuruluşunun bildirdiği komisyon. Bildirilmemişse null kalır ve raporda
  -- "tahmini" olarak ayrıca hesaplanır; gerçek gibi gösterilmez.
  fee_amount numeric(12, 2),
  currency text not null default 'TRY',
  period_start timestamptz,
  period_end timestamptz,
  failure_reason text,
  is_test boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_ref)
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_paid_idx on public.payments (paid_at) where status in ('succeeded', 'refunded');
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Webhook olay günlüğü: aynı olay iki kez işlenmez (unique provider+event_id).
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  result text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- Ödeme kuruluşundan bankaya yapılan GERÇEK aktarımlar. Yalnızca ödeme kuruluşu
-- raporu/API'si ile doğrulanan kayıtlar girilir.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_ref text,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'TRY',
  status text not null check (status in ('scheduled', 'paid', 'failed')),
  expected_date date,
  paid_at timestamptz,
  source text not null check (source in ('provider_api', 'provider_report')),
  notes text not null default '',
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

create or replace function public.is_premium(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.status in ('active', 'canceled', 'renewal_pending')
      and s.current_period_end is not null
      and s.current_period_end > now()
  );
$$;

-- Süresi dolan abonelikleri işaretle (günlük cron tarafından çağrılır).
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.subscriptions
  set status = 'expired'
  where status in ('active', 'canceled', 'renewal_pending')
    and current_period_end is not null
    and current_period_end <= now()
    and (
      status = 'canceled'
      or cancel_at_period_end
      -- Yenileme 3 gün içinde başarıyla tahsil edilemediyse abonelik sona erer.
      -- (Bu sürede Premium hakkı YOKTUR; is_premium dönem bitişine bakar.)
      or (status = 'renewal_pending' and current_period_end <= now() - interval '3 days')
    );
  get diagnostics n = row_count;

  -- Otomatik yenilenen ama dönemi biten abonelikler 'renewal_pending' olur.
  update public.subscriptions
  set status = 'renewal_pending'
  where status = 'active' and not cancel_at_period_end
    and current_period_end is not null and current_period_end <= now();
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reklamlar
-- ---------------------------------------------------------------------------
create table public.ad_placements (
  code text primary key check (code in ('home_feed', 'news_detail', 'shorts_feed', 'match_center', 'player_profile', 'community_feed')),
  name text not null,
  enabled boolean not null default true,
  provider text not null default 'direct' check (provider in ('direct', 'adsense', 'direct_then_adsense')),
  adsense_slot_id text check (adsense_slot_id is null or adsense_slot_id ~ '^[0-9]{6,20}$'),
  updated_at timestamptz not null default now()
);

insert into public.ad_placements (code, name) values
  ('home_feed', 'Ana sayfa akışı (doğal kart)'),
  ('news_detail', 'Haber detayı sonu'),
  ('shorts_feed', 'Shorts akışı (seyrek sponsorlu kart)'),
  ('match_center', 'Maç merkezi (skoru engellemeyen alan)'),
  ('player_profile', 'Oyuncu profili alt kısmı'),
  ('community_feed', 'Taraftar akışı (sponsorlu gönderi)')
on conflict do nothing;

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  advertiser_name text not null,
  placement_codes text[] not null,
  title text not null check (char_length(title) between 2 and 90),
  body text not null default '' check (char_length(body) <= 200),
  image_url text,
  target_url text not null check (target_url ~ '^https://'),
  cta_label text not null default 'İncele' check (char_length(cta_label) <= 24),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  priority smallint not null default 0,
  contract_amount numeric(12, 2),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index ad_campaigns_active_idx on public.ad_campaigns (starts_at, ends_at) where is_active;

-- Gerçek sayılan gösterim/tıklama (kendi sponsor kampanyalarımız için).
create table public.ad_daily_stats (
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  placement_code text not null references public.ad_placements (code),
  day date not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  primary key (campaign_id, placement_code, day)
);

-- Reklam ağı gelirleri (AdSense/AdMob). Bu rakamlar ağın kendi raporundan gelir;
-- uygulama kendi başına reklam ağı geliri HESAPLAMAZ / UYDURMAZ.
create table public.ad_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('adsense', 'admob', 'direct')),
  period_start date not null,
  period_end date not null,
  amount numeric(12, 2) not null,
  currency text not null default 'TRY',
  impressions integer,
  clicks integer,
  revenue_status text not null check (revenue_status in ('estimated', 'finalized', 'received')),
  source text not null check (source in ('provider_api', 'provider_report', 'contract')),
  notes text not null default '',
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index ad_revenue_period_idx on public.ad_revenue_entries (period_start);

create or replace function public.record_ad_event(p_campaign uuid, p_placement text, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('impression', 'click') then
    raise exception 'Geçersiz olay';
  end if;
  if not exists (select 1 from public.ad_campaigns c where c.id = p_campaign and p_placement = any (c.placement_codes)) then
    raise exception 'Kampanya bulunamadı';
  end if;
  insert into public.ad_daily_stats (campaign_id, placement_code, day, impressions, clicks)
  values (p_campaign, p_placement, (now() at time zone 'Europe/Istanbul')::date,
          case when p_kind = 'impression' then 1 else 0 end,
          case when p_kind = 'click' then 1 else 0 end)
  on conflict (campaign_id, placement_code, day) do update
  set impressions = public.ad_daily_stats.impressions + excluded.impressions,
      clicks = public.ad_daily_stats.clicks + excluded.clicks;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.payouts enable row level security;
alter table public.ad_placements enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_daily_stats enable row level security;
alter table public.ad_revenue_entries enable row level security;

create policy app_settings_read on public.app_settings for select
  using (is_public or public.is_owner_aal2());
create policy app_settings_write on public.app_settings for update
  using (public.is_owner_aal2()) with check (public.is_owner_aal2());

create policy subscriptions_read on public.subscriptions for select
  using (user_id = auth.uid() or public.is_owner_aal2());
create policy payments_read on public.payments for select
  using (user_id = auth.uid() or public.is_owner_aal2());
create policy payment_events_read on public.payment_events for select using (public.is_owner_aal2());
create policy payouts_read on public.payouts for select using (public.is_owner_aal2());
create policy payouts_write on public.payouts for insert with check (public.is_owner_aal2());

create policy ad_placements_read on public.ad_placements for select using (true);
create policy ad_placements_write on public.ad_placements for update
  using (public.is_owner_aal2()) with check (public.is_owner_aal2());

create policy ad_campaigns_read on public.ad_campaigns for select
  using ((is_active and now() between starts_at and ends_at) or public.is_owner_aal2());
create policy ad_campaigns_write on public.ad_campaigns for all
  using (public.is_owner_aal2()) with check (public.is_owner_aal2());

create policy ad_daily_stats_read on public.ad_daily_stats for select using (public.is_owner_aal2());
create policy ad_revenue_read on public.ad_revenue_entries for select using (public.is_owner_aal2());
create policy ad_revenue_write on public.ad_revenue_entries for insert with check (public.is_owner_aal2());

grant select on public.app_settings, public.ad_placements, public.ad_campaigns to anon, authenticated;
grant update (value) on public.app_settings to authenticated;
grant update (enabled, provider, adsense_slot_id) on public.ad_placements to authenticated;
grant insert, update, delete on public.ad_campaigns to authenticated;
grant select on public.subscriptions, public.payments to authenticated;
grant select on public.payment_events, public.ad_daily_stats to authenticated;
grant select, insert on public.payouts, public.ad_revenue_entries to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.is_premium(uuid) to anon, authenticated;
revoke execute on function public.expire_subscriptions() from public, anon, authenticated;
revoke execute on function public.record_ad_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.expire_subscriptions(), public.record_ad_event(uuid, text, text) to service_role;

-- Premium rozetini aktif aboneliğe ver
create or replace function public.subscriptions_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    insert into public.user_badges (user_id, badge_code) values (new.user_id, 'premium_taraftar')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger subscriptions_after_change after insert or update on public.subscriptions
  for each row execute function public.subscriptions_badge();
insert into amed_meta.applied (name) values ('20261109000005_monetization.sql');

-- ---------------------------------------------------------------------------
-- 20261109000006_storage.sql
-- ---------------------------------------------------------------------------
-- AMEDSPOR — 0006 Supabase Storage kovaları ve politikaları
-- Ücretsiz plan sınırları göz önüne alınarak dosya boyutları kısıtlanmıştır.
--   avatars : herkese açık, en fazla 2 MB, yalnızca görsel
--   media   : özel (imzalı URL ile sunulur), en fazla 50 MB, görsel + kısa video
-- Dosya yolu her zaman "<kullanıcı-id>/..." ile başlamalıdır.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('media', 'media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars_owner_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_owner_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
insert into amed_meta.applied (name) values ('20261109000006_storage.sql');

-- ---------------------------------------------------------------------------
-- 20261109000007_admin_stats.sql
-- ---------------------------------------------------------------------------
-- AMEDSPOR — 0007 Yönetici istatistikleri ve ücretsiz plan kullanım takibi

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.has_role('moderator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'posts', (select count(*) from public.posts),
    'posts_pending', (select count(*) from public.posts where moderation_status = 'pending'),
    'comments_pending', (select count(*) from public.comments where moderation_status = 'pending'),
    'reports_open', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'appeals_open', (select count(*) from public.appeals where status = 'open'),
    'news_pending', (select count(*) from public.news where status = 'pending'),
    'news_published', (select count(*) from public.news where status = 'published'),
    'matches', (select count(*) from public.matches),
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0),
    'storage_objects', (select count(*) from storage.objects)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
insert into amed_meta.applied (name) values ('20261109000007_admin_stats.sql');

-- ---------------------------------------------------------------------------
-- 20261109000008_mobile.sql
-- ---------------------------------------------------------------------------
-- AMEDSPOR — 0008 Mobil uygulama desteği
--
-- 1) Medya imzalama: Mobil uygulama (tek HTML) medya için imzalı URL'yi doğrudan
--    Supabase Storage'dan ister. Bir dosya ancak, ait olduğu gönderiyi görüntüleme
--    hakkı olan kişi tarafından imzalanabilir (özel hesap, engelleme ve moderasyon
--    kuralları can_view_post ile aynen uygulanır).
create policy "media_visible_post_read" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.post_media pm
      where (pm.storage_path = storage.objects.name or pm.poster_path = storage.objects.name)
        and public.can_view_post(pm.post_id)
    )
  );

-- 2) Profil fotoğrafı adresi istemciden doğrudan güncellenebildiği için yalnızca
--    kullanıcının kendi Supabase "avatars" klasörünü gösterebilir (dış adreslerden
--    izleme pikseli vb. yüklenmesini engeller).
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_service() then
    return new;
  end if;
  if new.username is distinct from old.username
     or new.display_name is distinct from old.display_name
     or new.bio is distinct from old.bio
     or new.status is distinct from old.status
     or new.followers_count is distinct from old.followers_count
     or new.following_count is distinct from old.following_count
     or new.posts_count is distinct from old.posts_count
     or new.points is distinct from old.points
     or new.accepted_terms_at is distinct from old.accepted_terms_at
     or new.id is distinct from old.id then
    raise exception 'Bu alan yalnızca sunucu üzerinden güncellenebilir'
      using errcode = '42501';
  end if;
  if new.avatar_url is distinct from old.avatar_url
     and new.avatar_url is not null
     and new.avatar_url !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/' || new.id::text || '/avatar-[0-9a-f-]{36}\.(webp|jpg|png)$') then
    raise exception 'Geçersiz profil fotoğrafı adresi' using errcode = '42501';
  end if;
  return new;
end;
$$;
insert into amed_meta.applied (name) values ('20261109000008_mobile.sql');

-- ---------------------------------------------------------------------------
-- 20261109000009_privacy_hardening.sql
-- ---------------------------------------------------------------------------
-- AMEDSPOR — 0009 Gizlilik sertleştirmesi
-- Yardımcı fonksiyonlar API üzerinden (RPC) doğrudan çağrılabildiği için, bir kullanıcı
-- BAŞKA biri adına sorgu yapamamalıdır: "X, gizli Y'yi takip ediyor mu?", "Z yönetici mi?",
-- "W Premium mu?" gibi bilgiler sızdırılmaz. Sunucu (service_role) için davranış aynıdır.

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (public.is_service_request() or auth.uid() in (a, b))
    and exists (
      select 1 from public.blocks
      where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
    );
$$;

create or replace function public.can_view_profile(owner uuid, viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with v as (select case when public.is_service_request() then viewer else auth.uid() end as id)
  select
    case
      when v.id is not null and v.id = owner then true
      when v.id is not null and public.is_blocked_between(owner, v.id) then false
      when not exists (select 1 from public.profiles p where p.id = owner and p.status = 'active') then false
      when exists (select 1 from public.profiles p where p.id = owner and not p.is_private) then true
      when v.id is null then false
      else exists (select 1 from public.follows f where f.follower_id = v.id and f.following_id = owner)
    end
  from v;
$$;

create or replace function public.has_role(required text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      uid is not distinct from auth.uid()
      or public.is_service_request()
      or exists (select 1 from public.admin_roles r where r.user_id = auth.uid() and r.role in ('owner', 'admin'))
    )
    and exists (
      select 1 from public.admin_roles r
      where r.user_id = uid
        and (r.role = required or r.role = 'owner' or (r.role = 'admin' and required in ('moderator', 'editor')))
    );
$$;

create or replace function public.can_view_post(p_post_id uuid, viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with v as (select case when public.is_service_request() then viewer else auth.uid() end as id)
  select exists (
    select 1 from public.posts p, v
    where p.id = p_post_id
      and (
        (p.author_id = v.id)
        or (p.moderation_status = 'approved' and public.can_view_profile(p.author_id, v.id))
        or public.has_role('moderator', v.id)
      )
  );
$$;

create or replace function public.is_premium(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null
    and (uid = auth.uid() or public.is_service_request())
    and exists (
      select 1 from public.subscriptions s
      where s.user_id = uid
        and s.status in ('active', 'canceled', 'renewal_pending')
        and s.current_period_end is not null
        and s.current_period_end > now()
    );
$$;
insert into amed_meta.applied (name) values ('20261109000009_privacy_hardening.sql');

commit;
