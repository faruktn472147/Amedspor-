# Mimari ve Güvenlik

## Genel yapı

```
Tarayıcı / PWA ──► Next.js (Vercel)  ──► Supabase
                    │  Sunucu bileşenleri (oturumla, RLS altında okuma)
                    │  Sunucu işlemleri (doğrulama + moderasyon + hız sınırı)
                    │  API: webhook, reklam sayacı, cron, veri dışa aktarma
                    └─ proxy.ts (oturum çerezi yenileme)
Supabase: PostgreSQL (RLS) · Auth (e-posta kodu, Google, TOTP 2FA) · Storage (avatars, media)
```

## Güvenlik modeli (katmanlı)

1. **Veritabanı (son savunma hattı)** — Her tabloda RLS. Örnekler:
   - Kullanıcı yalnızca kendi içeriğini silebilir; başkasının adına içerik ekleyemez.
   - İstemciden (API ile doğrudan) eklenen gönderi/yorum **her zaman "incelemede"** başlar; moderasyonu
     atlayamaz. Kullanıcı adı/biyografi yalnızca sunucu üzerinden (moderasyondan geçerek) değişir.
   - Abonelik/ödeme tabloları istemciden **yazılamaz**; yalnızca imzası doğrulanmış webhook yazar.
   - Finans tabloları yalnızca **sahip + aal2 (2FA)** ile okunur.
   - Özel hesap içerikleri yalnızca onaylı takipçilere; engellenen kullanıcılar birbirini göremez.
   - Kişisel ayarlar (reklam izni vb.) sütun düzeyinde gizlidir.
   - Tahminler maç başlayınca kilitlenir; bilgi yarışmasının doğru cevabı istemciye gitmez.
2. **Sunucu** — Oturum `getClaims()` ile imza doğrulanarak okunur. Rol kontrolleri sunucuda.
   Zod ile girdi doğrulama, veritabanı tabanlı ücretsiz hız sınırı, açık yönlendirme koruması.
3. **Dosya yükleme** — Bucket düzeyinde tür/boyut sınırı, kullanıcı klasörü zorunluluğu, sunucuda
   dosya imzası (magic bytes) kontrolü, görseller istemcide yeniden kodlanır (EXIF/konum silinir).
4. **HTTP** — X-Frame-Options, nosniff, HSTS, Referrer-Policy, Permissions-Policy.
5. **Gizli anahtarlar** — Yalnızca ortam değişkenlerinde; `.env*` git dışında, `.env.example` örnektir.

Test sırasında yakalanan ve düzeltilen gerçek bir açık: `SECURITY DEFINER` fonksiyon içinde
`current_user` kontrolü her zaman yetkili göründüğü için normal kullanıcı maç puanlaması
yapabiliyordu. JWT rolüne bakan `is_service_request()` ile düzeltildi ve testle korunuyor.

## Moderasyon

`src/lib/moderation/` — Türkçe'ye özel normalizasyon (İ/ı, leetspeak `s1kt1r`, harf tekrarı,
`s i k t i r` / `s.i.k` bölmeleri, görünmez karakterler), kök/tam/ifade eşleştirme, masum kelime
listesi (`sıkıntı`, `siklet`, `malzeme`…), nefret söylemi kalıpları, telefon/TC kimlik (algoritmalı)/
kart (Luhn)/IBAN tespiti, spam. Kararlar: **izin ver / incelemeye al / engelle**. Görsel içerik
otomatik denetlenmez (ücretsiz güvenilir çözüm yok); yeni hesapların medyası incelemeye alınır ve
şikâyet + itiraz sistemi vardır.

## Ücretsiz plan sınırları ve tasarım kararları

| Sınır (Supabase Free, üçüncü taraf kaynaklara göre) | Önlem |
| --- | --- |
| ~500 MB veritabanı | Haber tam metni saklanmaz; sayaçlar tabloda; yönetim panelinde kullanım çubuğu |
| ~1 GB dosya depolama | Görseller 1600 px WebP'ye küçültülür; video ≤50 MB, ≤60 sn, ≤1080×1920 |
| ~5 GB trafik | Videolar yalnızca aktifken yüklenir; veri tasarrufu modu; imzalı URL |
| 7 gün hareketsizlikte proje durdurulur | Günlük cron proje aktifliğini de korur |
| 50.000 aylık aktif kullanıcı | Başlangıç için yeterli |

Kesin ve güncel değerler: https://supabase.com/pricing

## Yol haritası (henüz yapılmayanlar)

- iyzico/PayTR canlı entegrasyonu (üye işyeri hesabı gerekli)
- Google Play Faturalandırma (uygulama içi Premium) ve AdMob — onay gerektirir
- iOS (App Store) — Apple geliştirici programı yıllık ücretli
- Tematik taraftar toplulukları (gruplar)
- Gerçek zamanlı canlı skor (Supabase Realtime) — şu an canlı maçta 30 sn'de bir yenileme
- Anlık (push) bildirimler — şu an uygulama içi bildirim
- Yapay zekâ ile haber özeti — ücretsiz ve güvenilir bir model bulunduğunda; kaynak zorunluluğu korunur
- İçerik Güvenlik Politikası (CSP, nonce ile)
