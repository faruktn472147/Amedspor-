# Kurulum Rehberi (adım adım)

Bu rehber teknik bilgi gerektirmeyecek şekilde yazılmıştır. Tüm adımlar **ücretsiz** planlarla yapılır.
Hiçbir adımda kredi kartı eklemeniz gerekmez; bir servis kart isterse durun ve devam etmeyin.

> Ücretsiz plan sınırları sağlayıcılar tarafından değiştirilebilir. Kurulumdan önce
> https://supabase.com/pricing ve https://vercel.com/pricing sayfalarını kontrol edin.

---

## 1. Supabase projesi (veritabanı + üyelik + dosya depolama)

1. https://supabase.com adresinde GitHub hesabınızla **ücretsiz** hesap açın.
2. **New project** → bölge olarak **Frankfurt (eu-central-1)** seçin (Türkiye'ye en yakın), güçlü bir veritabanı şifresi belirleyin ve bir yere kaydedin.
3. Proje açılınca **Project Settings → API** sayfasından şu üç değeri alın:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / `publishable` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (**GİZLİ** — kimseyle paylaşmayın, GitHub'a yüklemeyin)

### Veritabanı şemasını yükleme

**SQL Editor** → **New query** açın ve `supabase/migrations/` klasöründeki dosyaları **isim sırasıyla**
(0001 → 0007) tek tek yapıştırıp **Run** deyin. Her biri "Success" vermeli.

> Not: Supabase, Mayıs 2026'dan sonra açılan projelerde tablolara açık `GRANT` izni istiyor.
> Migration dosyaları bu izinleri zaten içeriyor.

### Kendinizi platform sahibi yapma

1. Sitede kendi e-postanızla kayıt olun ve e-postanızı doğrulayın.
2. SQL Editor'da çalıştırın (kullanıcı adınızı yazın):

```sql
insert into public.admin_roles (user_id, role)
select id, 'owner' from public.profiles where username = 'KULLANICI_ADINIZ';
```

Yalnızca **bir** sahip olabilir (veritabanı bunu zorunlu kılar). Moderatör/editör rolleri sonradan
panelden verilir.

3. **Ayarlar → Güvenlik** sayfasından **iki aşamalı doğrulamayı (2FA)** açın, çıkış yapıp yeniden girin.
   Gelir ve reklam yönetimi ekranları 2FA olmadan açılmaz.

---

## 2. E-posta doğrulama kodu (gerçek e-posta gönderimi)

**Dürüst bilgi:** Supabase'in yerleşik e-posta servisi yalnızca deneme içindir; saatte çok az e-posta
gönderir ve gerçek kullanıcılara güvenilir şekilde ulaşmaz. Gerçek kullanıcılar için **kendi SMTP
sağlayıcınızı** bağlamanız gerekir.

Ücretsiz katmanı olan SMTP seçenekleri (güncel koşulları kendi sitelerinden kontrol edin):
- **Brevo** (eski Sendinblue) — ücretsiz planda günlük gönderim limiti vardır.
- **Resend** — ücretsiz planda aylık/günlük limit vardır; alan adı doğrulaması ister.

Bu servisler genellikle **kendi alan adınızı** doğrulamanızı ister (alan adı ücretlidir). Alan adı
almadan önce bu konuda karar vermeniz gerekir; **ben sizin adınıza alan adı satın almadım**.

Kurulum: Supabase → **Authentication → Emails → SMTP Settings** → sağlayıcının verdiği host, port,
kullanıcı adı, şifre ve gönderici adresini girin.

### Kodlu doğrulama e-postası

Uygulama, kayıtta e-postaya gelen **6 haneli kodu** kullanır. Supabase → **Authentication → Emails → Templates**:

- **Confirm signup** şablonunda `{{ .Token }}` geçmeli. Örnek:
  `AMEDSPOR doğrulama kodunuz: {{ .Token }}`
- **Reset password** şablonunda da `{{ .Token }}` geçmeli.

**Authentication → Providers → Email**: "Confirm email" açık olsun.
**Authentication → URL Configuration**: Site URL = sitenizin adresi; Redirect URLs'e
`https://SITENIZ/auth/callback` ekleyin.

---

## 3. Google ile giriş (ücretsiz)

1. https://console.cloud.google.com → yeni proje oluşturun.
2. **APIs & Services → OAuth consent screen**: uygulama adı "AMEDSPOR Taraftar", destek e-postanız,
   gizlilik politikası adresi `https://SITENIZ/yasal/gizlilik`. Kullanıcı türü: External.
3. **Credentials → Create credentials → OAuth client ID** → Web application.
   - Authorized redirect URI: Supabase → Authentication → Providers → Google sayfasında yazan
     `https://<proje>.supabase.co/auth/v1/callback` adresi.
4. Verilen **Client ID** ve **Client Secret**'ı Supabase → Authentication → Providers → **Google**
   bölümüne girip etkinleştirin.

> Google, uygulamanızı "yayınlama" (production) durumuna almanızı ve bazı durumlarda doğrulama
> istemesini isteyebilir. Bu işlemleri sizin hesabınızla sizin yapmanız gerekir.

---

## 4. Yayına alma (Vercel Hobby — ücretsiz)

1. https://vercel.com → GitHub ile giriş → **Add New Project** → bu depoyu seçin.
2. **Environment Variables** bölümüne `.env.example` dosyasındaki değişkenleri girin:
   - `NEXT_PUBLIC_SITE_URL` = Vercel'in verdiği adres (ör. `https://amedspor.vercel.app`)
   - Supabase değerleri (1. adım)
   - `CRON_SECRET` = rastgele uzun bir değer
   - `PAYMENT_PROVIDER=none` (gerçek ödeme kuruluşu bağlanana kadar)
3. **Deploy**. `vercel.json` içindeki günlük görev (abonelik süresi kontrolü + haber taraması) otomatik
   tanımlanır. Hobby planında cron günde bir kez çalışır.

> Vercel Hobby planı **ticari olmayan** kullanım içindir. Platform reklam veya abonelik geliri elde
> etmeye başladığında Vercel'in kullanım şartlarına göre ücretli plana geçmeniz gerekebilir. Bu bir
> maliyettir ve **sizin onayınız olmadan yapılmaz**. Ücretsiz alternatifler (ör. Cloudflare Pages)
> o aşamada ayrıca değerlendirilebilir.

---

## 5. Telefona kurulum (PWA)

Site yayına alındıktan sonra:
- **Android/Chrome**: menü → "Uygulamayı yükle".
- **iPhone/Safari**: Paylaş → "Ana Ekrana Ekle".

Mağaza (Google Play / App Store) uygulaması bir sonraki aşamadadır; Google Play geliştirici hesabı
tek seferlik, Apple Developer Program yıllık **ücretlidir** — onayınız olmadan açılmaz.

---

## 6. Haber kaynakları

**Yönetim → Haber kaynakları** sayfasından RSS/Atom beslemesi olan ve kullanım koşulları buna izin veren
kaynakları ekleyin. Platform yalnızca başlık, kısa özet ve kaynak bağlantısı saklar. Güven seviyesi
"İncelemeli" olan kaynakların haberleri, ve tüm transfer/söylenti/hassas haberler yönetici onayına düşer.

> Kaynak adreslerini sizin doğrulamanız gerekir; bu oturumda dış sitelere erişim kapalı olduğu için
> hiçbir kaynak adresini doğrulamadan veritabanına eklemedim.

## 7. Maç ve oyuncu verileri

Ücretsiz ve ticari kullanıma izinli, Türkiye liglerini kapsayan güvenilir bir canlı skor API'si
bulunana kadar maç, kadro ve istatistikler **Yönetim → Maçlar / Oyuncular** ekranından, kaynağı
belirtilerek girilir. Kaynak belirtilmeden istatistik kaydı yapılamaz.
