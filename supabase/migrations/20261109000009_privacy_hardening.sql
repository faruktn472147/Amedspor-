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
