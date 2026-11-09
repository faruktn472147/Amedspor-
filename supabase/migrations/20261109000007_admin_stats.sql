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
