# Premium Abonelik, Reklam ve Gelir Rehberi

> Bu belge bilgilendirme amaçlıdır; **hukuki, mali veya vergi danışmanlığı değildir.** Şirket kuruluşu,
> vergi kaydı ve fatura yükümlülükleri için bir **mali müşavire**, sözleşme ve KVKK metinleri için bir
> **avukata** danışın. Komisyon oranları ve başvuru şartları sık değişir; aşağıdaki bilgileri ödeme
> kuruluşunun kendi sitesinden ve satış ekibinden **yazılı** teyit edin.

## 1. Gelir modeli (uygulamada hazır olanlar)

| | Ücretsiz üye | Premium üye |
| --- | --- | --- |
| Haber, akış, paylaşım, Shorts, maç merkezi, oyuncular, tahmin | ✅ | ✅ |
| Reklam | Seyrek, etiketli ("Sponsorlu"/"Reklam") | **Hiç yok** — reklam kodu tarayıcıya bile gönderilmez |
| Ücret | 0 TL | Aylık **10 TL** (yönetici panelinden değiştirilebilir) |

Premium kontrolü veritabanında `is_premium()` fonksiyonuyla yapılır: yalnızca ödemesi başarıyla alınmış
ve dönemi bitmemiş abonelikler Premium sayılır. Süre bitince kullanıcı **otomatik olarak** ücretsize döner.

### Abonelik durumları
Aktif · Ödeme bekleniyor · Ödeme başarısız · İptal edildi · Süresi doldu · Yenileme bekleniyor

**İptal kuralı:** Kullanıcı tek tıkla iptal eder; yeni ücret alınmaz, ödediği dönemin sonuna kadar Premium
devam eder. **İade** yapılırsa Premium hemen sona erer.

## 2. Ödeme altyapısı — mevcut durum

| Bileşen | Durum |
| --- | --- |
| Sağlayıcıdan bağımsız ödeme modülü (`src/lib/payments/`) | ✅ Hazır, test edildi |
| Webhook imza doğrulama, tekrar işleme koruması, tutar kontrolü | ✅ Hazır, test edildi |
| **Test modu** (gerçek para yok, HMAC-SHA256 imzalı) | ✅ Hazır; canlı ortamda kendiliğinden **kapalı** |
| iyzico entegrasyonu | ⏳ **Henüz bağlı değil** (aşağıya bakın) |
| PayTR entegrasyonu | ⏳ Değerlendirme aşamasında |

**Neden iyzico henüz kodlanmadı?** iyzico'nun webhook imza formülünün güncel resmî dokümanını bu
oturumda okuyamadım (doküman sitesine erişim kapalıydı). Eski formül artık desteklenmiyor
(`X-IYZ-SIGNATURE-V3` gerekiyor ve iyzico'dan ayrıca etkinleştirilmesi isteniyor). Yanlış bir imza
formülü **sahte ödemelerin kabul edilmesine** yol açabileceği için tahminle kod yazmadım.
Üye işyeri hesabınız açılıp sandbox anahtarları alındığında adaptör, mevcut test altyapısı kullanılarak
tamamlanacak.

## 3. Türkiye'de ödeme kuruluşu karşılaştırması (Kasım 2026 araştırması)

| Kuruluş | Türkiye'de hizmet | Tekrarlayan ödeme / abonelik | Komisyon | Not |
| --- | --- | --- | --- | --- |
| **iyzico** | Evet (lisanslı ödeme kuruluşu) | Abonelik ürünü ve abonelik webhook'ları var | Teklife göre; yazılı teyit alın | Webhook'ta `X-IYZ-SIGNATURE-V3` zorunlu; etkinleştirme için iyzico entegrasyon ekibiyle iletişim gerekiyor |
| **PayTR** | Evet | Kart saklama + kayıtlı karttan tekrarlayan tahsilat; "abonelik yöntemi" hizmeti listeleniyor | Sabit tarife yok, ciroya ve iş modeline göre; üçüncü taraf kaynaklar %0,99–%4 aralığı veriyor (resmî değil) | Şahıs işletmesi başvurusu: vergi levhası, kimlik, imza beyannamesi, banka hesabı belgesi |
| **Stripe** | **Türkiye'de doğrudan hesap açılamıyor** (araştırılan kaynaklara göre) | — | — | Ancak yurt dışı şirket ile mümkün; önerilmez |

Kaynaklar:
- iyzico webhook dokümanı: https://docs.iyzico.com/en/advanced/webhook
- PayTR (komisyon ve başvuru, üçüncü taraf): https://www.ideasoft.com.tr/paytr-komisyon-oranlari/ , https://www.ideasoft.com.tr/paytr-nedir-nasil-basvuru-yapilir/
- PayTR SDK (kart saklama ve tekrarlayan ödeme, topluluk paketi): https://packagist.org/packages/done6666/paytr-sdk
- Stripe ve Türkiye: https://www.jotform.com/tr/answers/26820381-stripe-uzerinden-turkiye-musterilerinden-odeme-almak , https://dev.to/mahmut_gndzalp_c736ac4b/turkish-e-commerce-why-local-pos-integration-beats-stripe-most-of-the-time-e60

**Önerim:** iyzico ve PayTR'ye aynı anda başvurup **abonelik/tekrarlayan ödeme** için yazılı komisyon
teklifi isteyin; düşük tutarlı (10 TL) işlemlerde **sabit işlem ücreti** net kazancı ciddi etkiler,
bunu özellikle sorun.

## 4. Para banka hesabınıza nasıl gelir?

1. **Yasal statü:** Ödeme kuruluşları genellikle **vergi levhası** ister. Şahıs şirketi (ör. serbest
   meslek / esnaf kaydı) veya limited şirket kurmanız gerekebilir. Mali müşavirinize danışın.
2. **Başvuru:** Kendi adınıza/şirketiniz adına ödeme kuruluşunun sitesinden üye işyeri başvurusu yapın.
3. **Kimlik ve işletme doğrulaması:** Kimlik, vergi levhası, imza beyannamesi/sirküleri, ikametgâh vb.
   belgeleri yükleyin.
4. **IBAN tanımlama:** Banka hesabınızı (IBAN) **yalnızca ödeme kuruluşunun kendi güvenli panelinde**
   tanımlayın. IBAN'ınız bu uygulamanın koduna veya veritabanına **yazılmaz**.
5. **Platformu bağlama:** Ödeme kuruluşunun verdiği API anahtarlarını Vercel → Environment Variables
   bölümüne girin (koda/GitHub'a değil). Webhook adresi:
   `https://SITENIZ/api/webhooks/payments/<sağlayıcı>`.
6. **Gelirin birikmesi:** Abonelik ödemeleri ödeme kuruluşu hesabınızda; reklam gelirleri AdSense/AdMob
   hesabınızda birikir.
7. **Kesintiler:** Ödeme kuruluşu komisyonu (+ varsa sabit işlem ücreti) düşülür. 10 TL'lik fiyat
   **KDV dahil** ise %20 KDV oranında 1,67 TL KDV'dir ve devlete ödenir. Gelir/kurumlar vergisi ayrıca
   hesaplanır. İadeler gelirden düşer.
8. **Aktarım:** Ödeme kuruluşu, sözleşmedeki takvime göre (ör. T+1, haftalık) parayı IBAN'ınıza aktarır.
   Bu aktarımları **Yönetim → Gelir yönetimi → Bankaya aktarım kaydı** bölümüne referans numarasıyla
   girersiniz; uygulama aktarım yapılmamış parayı "aktarıldı" olarak göstermez.
9. **Takip:** Ödeme kuruluşu panelindeki raporları ve faturaları, uygulamanın CSV raporuyla
   karşılaştırın (mutabakat).

## 5. Örnek brüt gelir hesabı (10 TL/ay)

| Premium abone | Aylık brüt gelir |
| --- | --- |
| 100 | 1.000 TL |
| 500 | 5.000 TL |
| 1.000 | 10.000 TL |
| 5.000 | 50.000 TL |
| 10.000 | 100.000 TL |

**Bu rakamlar vergi, komisyon ve iadeler ÖNCESİDİR.** Örneğin 10 TL'lik bir ödemede yaklaşık 1,67 TL KDV
ve ödeme kuruluşu komisyonu düşüldükten sonra elinize geçen tutar belirgin şekilde daha düşüktür.
Yönetim panelindeki tablo, varsayılan tahmini komisyon (%3,5 + 0,25 TL, **gerçek teklifinizle
değiştirin**) ve KDV'yi düşerek "tahmini net" sütununu ayrıca gösterir.

## 6. Reklam ağları

### Google AdSense (web)
- Başvuru: https://adsense.google.com — kendi Google hesabınızla. Siteniz yayında, özgün içerikli ve
  gizlilik politikası sayfası olmalıdır. Onay süresi değişkendir.
- Alan adı: AdSense genellikle **kendi alan adınızı** ister; `*.vercel.app` alt alan adıyla onay
  alınamayabilir. Alan adı ücretlidir — onayınız gerekir.
- Onay sonrası: `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-...` değişkenini ekleyin; **Yönetim → Reklam
  yönetimi**'nden yerleşimlere slot numaralarını girin.
- Ödeme: Google, kazanç ödeme eşiğini aştığında (eşik ve vergi bilgileri AdSense panelinde) banka
  hesabınıza aktarır. Vergi bilgileri formunu AdSense panelinde doldurmanız gerekir.
- **Gerçek gelir verisi** AdSense panelinden alınır ve **Gelir yönetimi → Reklam geliri kaydı** ile
  "tahmini" veya "kesinleşti" olarak girilir. Uygulama AdSense gelirini kendisi hesaplamaz/uydurmaz.

### Google AdMob (Android/iOS)
Mağaza uygulaması bir sonraki aşamadadır. AdMob yalnızca yerel mobil uygulamalarda kullanılır; web
reklam sistemi ile ayrı tutulmuştur.

### Doğrudan sponsorlar (yerel işletmeler)
**Yönetim → Reklam yönetimi → Yeni sponsor kampanyası.** Gösterim ve tıklamalar platform tarafından
**gerçekten sayılır** (şişirmeye karşı kullanıcı başına günlük sınır). Sözleşme tutarını gelir kaydına
"Sponsor sözleşmesi" kaynağıyla girin. Sponsorlu içerik her zaman "Sponsorlu" etiketi taşır
(Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği gereği gizli reklam yapılmaz).

## 7. Kullanıcıyı sıkmayan reklam kuralları (koda gömülü)

- Akışın ilk 3 içeriğinden önce asla reklam yok; en sık 5 içerikte bir, sayfa başına en fazla 5 (varsayılan: 5. içerikten sonra, 10'da bir, sayfa başına 2).
- Shorts'ta en sık 8 videoda bir (varsayılan 15); her videonun önüne reklam **konmaz**; video içi reklam yok.
- Açılışta tam ekran reklam, sayfa geçiş reklamı, açılır pencere, sahte kapat butonu **yok**.
- Aynı kampanya kişi başı günlük sınırlı ve arka arkaya gösterilmez.
- Reklam yüklenemezse boş alan bırakılmaz; uygulama hata vermez.
- Bildirimler reklam için kullanılmaz (toplu bildirim günde en fazla 3).
- Çerez izni olmadan üçüncü taraf reklam kodu yüklenmez.

## 8. Test modunu kullanma (gerçek para yok)

`.env.local` içinde:
```
PAYMENT_PROVIDER=test
PAYMENT_TEST_WEBHOOK_SECRET=<en az 32 karakter rastgele değer>
```
Premium sayfasında "Premium ol" → test ödeme sayfası → "Başarılı/Başarısız ödeme simüle et".
Butonlar, gerçek bir ödeme kuruluşunun göndereceği imzalı webhook'u üretir ve canlıdaki **aynı**
doğrulama kodundan geçirir. Test ödemeleri `is_test` olarak işaretlenir ve gelir raporlarına dahil
edilmez. `NODE_ENV=production` iken test modu, `ALLOW_TEST_PAYMENTS=true` verilmedikçe **kapalıdır**.

## 9. Sahip yetkileri ve güvenlik

- Tek sahip hesabı (veritabanı benzersizlik kuralı).
- Gelir, fiyat, reklam ayarları, rol atama: **yalnızca sahip + 2FA (aal2)** — hem sunucu kodu hem
  veritabanı RLS politikası bunu ayrı ayrı zorunlu kılar.
- Moderatör ve editörlerin finansal verilere erişimi yoktur.
- Tüm yönetici işlemleri `audit_logs` tablosuna kaydedilir.
- Kart bilgisi saklanmaz; ödeme anahtarları yalnızca sunucu ortam değişkenlerindedir.
