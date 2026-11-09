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
