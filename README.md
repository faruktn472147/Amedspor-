# AMEDSPOR — Taraftar Platformu

Amedspor taraftarları için 7/24 dijital platform: haber merkezi, canlı maç merkezi, Shorts, taraftar akışı,
oyuncu istatistikleri, tahmin oyunları, profiller ve reklamsız **Premium** üyelik.

> **Bağımsız taraftar platformudur.** Amed Sportif Faaliyetler Kulübü ile resmî bağlantısı yoktur.
> Kulüp logosu, forması ve maç görüntüleri izin alınmadan kullanılmaz.

## Temel ilkeler

- **Sıfır bütçe ile başlar**: Next.js + Supabase Free + Vercel Hobby. Ücretli servis kullanılmaz.
- **Sahte veri yok**: Veri yoksa "veri yok" yazar. Skor, haber, istatistik uydurulmaz; her veri kaynağıyla gösterilir.
- **Sahte ödeme yok**: Gerçek ödeme kuruluşu bağlanana kadar Premium satın alınamaz. Geliştirme için imza doğrulamalı
  **test modu** vardır ve canlı ortamda kendiliğinden kapalıdır.
- **Güvenlik veritabanında**: Tüm tablolarda Row Level Security; yetkiler sunucuda ve veritabanında kontrol edilir.

## Teknoloji

| Katman | Seçim | Neden |
| --- | --- | --- |
| Web + PWA | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 | Ücretsiz, hızlı, mobil öncelikli, telefona kurulabilir |
| Veritabanı / Auth / Dosya | Supabase (PostgreSQL, Auth, Storage) — Free plan | Ücretsiz katman, RLS, e-posta kodu, Google girişi, 2FA |
| Barındırma | Vercel Hobby | Ücretsiz; günlük zamanlanmış görev (cron) |
| Test | Vitest, Playwright, gerçek PostgreSQL 16 | Ücretsiz, açık kaynak |

## Hızlı başlangıç

```bash
npm install
cp .env.example .env.local      # değerleri doldurun (docs/KURULUM.md)
npm run dev                      # http://localhost:3000
```

Supabase olmadan da uygulama açılır ve "Kurulum bekleniyor" uyarısıyla dürüstçe çalışır.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` / `npm start` | Üretim derlemesi / sunucusu |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript kontrolü |
| `npm test` | Birim + API testleri (Vitest) |
| `TEST_DATABASE_URL=$(bash scripts/db-test-up.sh) npm run test:db` | Gerçek PostgreSQL üzerinde güvenlik (RLS) testleri |
| `npm run build && npm run test:e2e` | Playwright uçtan uca testleri (mobil + masaüstü) |

## Dokümanlar

- [docs/KURULUM.md](docs/KURULUM.md) — Supabase, e-posta, Google girişi, Vercel kurulumu adım adım
- [docs/ODEME-VE-GELIR.md](docs/ODEME-VE-GELIR.md) — Premium, ödeme kuruluşları, reklam ağları, paranın banka hesabına gelişi
- [docs/MIMARI.md](docs/MIMARI.md) — Mimari, güvenlik modeli, ücretsiz plan sınırları, yol haritası

## Klasör yapısı

```
src/app/            Sayfalar, sunucu işlemleri (actions/), API uçları (api/)
src/components/     Arayüz bileşenleri
src/lib/            İş mantığı: moderation/, payments/, ads/, finance/, news/, uploads/, data/
supabase/migrations Veritabanı şeması + RLS (sırayla uygulanır)
tests/unit|api|db|e2e  Testler
```
