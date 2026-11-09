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
