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
