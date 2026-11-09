# Play Store'a Yükleme Rehberi (adım adım)

> Bu rehber teknik bilgi gerektirmeyecek şekilde yazılmıştır. Google Play şartları sık değişir;
> her adımda Play Console'un kendi yönlendirmelerini esas alın.

## 0. Ne hazır?

| Parça | Yer | Durum |
| --- | --- | --- |
| **Tek HTML uygulama** (tüm kod, tasarım ve ayarlar tek dosyada) | `mobile/www/index.html` | ✅ Hazır, test edildi |
| Android projesi (Capacitor 8, hedef Android API 36) | `mobile/android/` | ✅ GitHub'da derlendi |
| Otomatik paket üretimi (ücretsiz GitHub derleme sunucusu) | `.github/workflows/android.yml` | ✅ Test APK'sı üretiyor |
| Play Store görselleri | `mobile/store/play-icon-512.png`, `mobile/store/feature-graphic-1024x500.png` | ✅ Hazır |

**Neden yalnızca HTML yüklenemiyor?** Google Play, HTML dosyası kabul etmez; **AAB** (Android App Bundle)
paketi ister. Tek HTML dosyası, Android projesinin içine konur ve AAB'ye dönüştürülür. Bu dönüşümü
GitHub sizin yerinize ücretsiz yapar.

---

## 1. Tek HTML dosyasını bağlama (Supabase ve web sitesi)

Uygulama, web sitesiyle **aynı veritabanını** kullanır. Önce `docs/KURULUM.md`'deki Supabase ve Vercel
adımlarını tamamlayın. Sonra iki yoldan birini seçin:

**Kolay yol (önerilen):** GitHub deposunda **Settings → Secrets and variables → Actions → Variables**
sekmesine şu üç değişkeni ekleyin. Her derlemede dosyaya otomatik yazılır:

| Değişken | Değer |
| --- | --- |
| `AMED_SUPABASE_URL` | Supabase Project URL (ör. `https://xxxx.supabase.co`) |
| `AMED_SUPABASE_ANON_KEY` | Supabase **anon / publishable** anahtarı |
| `AMED_SITE_URL` | Web sitenizin adresi (ör. `https://amedspor-taraftar.vercel.app`) |

**Elle yol:** `mobile/www/index.html` dosyasının başındaki `amed-config` bloğundaki üç değeri yazın.

> ⚠️ `service_role` / `secret` anahtarını ASLA bu dosyaya veya bu değişkenlere yazmayın.
> anon anahtarı herkese açık olacak şekilde tasarlanmıştır; veriler veritabanı kurallarıyla (RLS) korunur.

Web sitesindeki Vercel ayarlarına ayrıca şunu ekleyin (gerekirse): `MOBILE_ALLOWED_ORIGINS` boş
bırakılabilir; uygulamanın kendi adresi (`https://localhost`) zaten izinlidir.

---

## 2. Test APK'sını telefonunuza kurma (ücretsiz)

1. GitHub'da deponuzu açın → **Actions** → **Android paketi** → en son başarılı (yeşil ✓) çalıştırma.
2. Sayfanın altındaki **Artifacts** bölümünden `amedspor-android-…` dosyasını indirin, zip'i açın.
3. İçindeki `app-debug.apk` dosyasını telefona gönderin, açın. Telefon "bilinmeyen kaynak" izni
   isterse yalnızca bu kurulum için verin.

Bu APK Play Store'a yüklenmez; yalnızca deneme içindir.

---

## 3. Yükleme anahtarı (imza) oluşturma — bir kez yapılır

Play Store'a yüklenen her paket **sizin** anahtarınızla imzalanmalıdır. Bu anahtarı **ben oluşturmadım**;
çünkü anahtarın yalnızca sizde olması gerekir.

**Yol A — Android Studio (ücretsiz, görsel arayüz):**
Android Studio'yu kurun → `mobile/android` klasörünü açın → **Build → Generate Signed App Bundle →
Android App Bundle → Create new…** → dosya adı `amedspor-upload.jks`, güçlü bir şifre, takma ad
(alias) `amedspor`. Sihirbaz size imzalı AAB'yi de üretir.

**Yol B — Komut satırı (Java yüklüyse):**
```bash
keytool -genkeypair -v -keystore amedspor-upload.jks -alias amedspor -keyalg RSA -keysize 2048 -validity 10000
```

**Anahtarı GitHub'a güvenle verme** (otomatik imzalı AAB için): dosyayı Base64 metnine çevirin:
- Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("amedspor-upload.jks")) | Set-Clipboard`
- macOS: `base64 -i amedspor-upload.jks | pbcopy`
- Linux: `base64 -w0 amedspor-upload.jks`

GitHub → **Settings → Secrets and variables → Actions → Secrets** → şu dört gizli değeri ekleyin:
`AMED_KEYSTORE_BASE64`, `AMED_KEYSTORE_PASSWORD`, `AMED_KEY_ALIAS` (`amedspor`), `AMED_KEY_PASSWORD`.

> 🔐 `amedspor-upload.jks` dosyasını ve şifresini **yedekleyin** ve asla GitHub'a dosya olarak
> yüklemeyin. Kaybederseniz Play Console'dan "yükleme anahtarını sıfırlama" talebi gerekir.

Sonraki her derlemede **Artifacts** içinde `app-release.aab` (imzalı Play Store paketi) da çıkar.

---

## 4. Google Play geliştirici hesabı — ÜCRETLİ, onayınız gerekir

- Hesap: https://play.google.com/console — **tek seferlik kayıt ücreti vardır (25 ABD doları).**
  Bu ödemeyi ben yapmadım ve sizin onayınız olmadan yapılmaz.
- Kimlik doğrulaması istenir.
- **Kişisel hesaplarda kapalı test zorunluluğu:** Kasım 2023'ten sonra açılan kişisel hesaplar,
  üretime çıkmadan önce **en az 12 test kullanıcısıyla 14 gün kesintisiz kapalı test** yapmak
  zorundadır. Kuruluş (şirket) hesapları bu kuraldan muaftır. (Kaynak: Google Play Console Yardım ve
  bağımsız rehberler — güncel şartı Play Console'da kontrol edin.)

---

## 5. Uygulamayı oluşturma ve mağaza kaydı

**Uygulama oluştur:** Ad: `AMEDSPOR Taraftar` · Varsayılan dil: Türkçe · Uygulama · Ücretsiz.

**Kısa açıklama (80 karakter):**
`Amedspor taraftarları için haberler, maç merkezi, Shorts ve tahmin oyunları.`

**Uzun açıklama (örnek):**
```
AMEDSPOR Taraftar, Amedspor taraftarlarının buluşma noktası:
• Kaynaklı ve tarihli haberler; söylentiler açıkça etiketlenir
• Maç merkezi: fikstür, skorlar, goller, kartlar ve kadrolar
• Taraftar akışı: fotoğraf, video, anket paylaş; beğen ve yorum yap
• Shorts: dikey kısa videolar, veri tasarrufu modu
• Tahmin oyunları ve günlük bilgi yarışması (para veya bahis yoktur)
• Saygılı topluluk: küfür filtresi, şikâyet ve engelleme

Bu uygulama bağımsız bir taraftar platformudur. Amed Sportif Faaliyetler
Kulübü ile resmî bir bağlantısı yoktur ve kulübün resmî uygulaması değildir.
```

**Görseller:** Uygulama simgesi `mobile/store/play-icon-512.png`, öne çıkan görsel
`mobile/store/feature-graphic-1024x500.png`. **Ekran görüntüleri** (en az 2 telefon görüntüsü):
uygulamayı gerçek verilerle kurduktan sonra kendi telefonunuzdan çekin. Sahte içerikli ekran görüntüsü
kullanmayın.

**Kategori:** Spor.

---

## 6. "Uygulama içeriği" formları (Play Console)

| Form | Doğru yanıt |
| --- | --- |
| Gizlilik politikası | `https://SITENIZ/yasal/gizlilik` |
| Reklamlar | **Evet, reklam içeriyor** (uygulamada yalnızca etiketli sponsor kartları; Premium'da yok) |
| Uygulama erişimi | İnceleme ekibi için bir **test hesabı** (e-posta + şifre) verin |
| İçerik derecelendirmesi | Anketi doldurun: kullanıcıların içerik paylaştığını ve etkileşim kurduğunu belirtin |
| Hedef kitle | 13 yaş ve üzeri (çocuklara yönelik değil) |
| Veri güvenliği | Toplanan: e-posta, kullanıcı adı, fotoğraf/video, uygulama içi etkileşimler. Aktarım şifreli: Evet. Kullanıcı silme talep edebilir: Evet |
| Hesap silme | Uygulama içinde: **Ayarlar → Hesabı kalıcı olarak sil**. Web bağlantısı: `https://SITENIZ/ayarlar/hesap` |
| Kumar / gerçek para | Yok (tahmin oyunları puan içindir) |
| Finansal özellikler | Yok |

Kullanıcı içeriği (UGC) kuralları için uygulamada hazır olanlar: kullanım şartlarını kabul, içerik ve
kullanıcı **şikâyeti**, kullanıcı **engelleme**, otomatik küfür filtresi, moderasyon paneli ve itiraz.

---

## 7. Yayın akışı

1. **Test → Kapalı test** kanalı oluşturun, imzalı `app-release.aab`'yi yükleyin.
2. 12+ test kullanıcısının e-postasını ekleyin, 14 gün kesintisiz test edin.
3. **Üretim erişimi için başvur** → onaydan sonra **Üretim** kanalına yayınlayın.
4. Güncellemeler: her GitHub derlemesinde sürüm kodu (versionCode) otomatik artar; yeni AAB'yi
   yükleyin.

> Uygulama kimliği `com.amedtaraftar.app` olarak ayarlandı. **İlk yüklemeden sonra değiştirilemez.**
> Farklı bir kimlik istiyorsanız ilk yüklemeden önce söyleyin.

---

## 8. Bilmeniz gereken önemli kurallar (dürüst bilgi)

1. **Premium satın alma uygulama içinde kapalı.** Google Play, uygulama içinde satılan dijital
   abonelikler (reklam kaldırma dahil) için **Google Play Faturalandırma** kullanılmasını ister ve
   kullanıcıyı başka ödeme sayfasına yönlendirmeyi kısıtlar. Haziran 2026'da duyurulan alternatif
   ödeme programı önce ABD, İngiltere ve AB'de başladı; Türkiye bu listede görünmüyor. Bu yüzden
   uygulamada satın alma düğmesi yok; web'den Premium olan kullanıcılar uygulamada da reklamsızdır.
   Play Faturalandırma entegrasyonu ayrı bir adımdır (Google komisyon keser) ve onayınızla yapılır.
2. **Marka riski.** "AMEDSPOR" adı kulübün markasıdır. Google, izinsiz marka kullanımını veya resmî
   uygulama izlenimi veren uygulamaları reddedebilir/kaldırabilir. En güvenli yol kulüpten yazılı
   izin almaktır. İzin yoksa açıklamada "resmî değildir" ibaresi bulunmalıdır (hazırladım); yine de
   ret gelirse uygulama adını değiştirmek gerekebilir.
3. **Google ile giriş uygulamada yok.** Google, uygulama içi web görünümlerinde (WebView) Google
   girişini engeller. Uygulamada e-posta + şifre + e-posta kodu ile giriş vardır. Google girişi web
   sitesinde çalışır.
4. **Reklam ağı yok.** AdSense uygulama içi web görünümlerinde kullanılamaz; AdMob entegrasyonu ayrı
   bir aşamadır. Uygulamada yalnızca platformun kendi sponsor kartları (çerezsiz) gösterilir.
5. **iOS (App Store)** bu aşamada yok; Apple geliştirici programı yıllık ücretlidir.

Kaynaklar:
- Kişisel hesaplarda test şartı: https://support.google.com/googleplay/android-developer/answer/14151465
- 12 test kullanıcısı kuralı (bağımsız rehber): https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026
- Google Play genişletilmiş ödeme seçenekleri (Haziran 2026): https://android-developers.googleblog.com/2026/06/play-expanded-billing.html
- Rekabet Kurumu'nun Google Play ödeme soruşturması (Ağustos 2025): https://turkishminute.com/2025/08/22/turkey-opens-antitrust-probe-into-google-over-play-store-payments/
