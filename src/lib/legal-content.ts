/**
 * Yasal metin TASLAKLARI. Kesin hukuki görüş değildir; yayına geçmeden önce bir avukat /
 * KVKK uzmanı tarafından kontrol edilmeli ve köşeli parantezli alanlar doldurulmalıdır.
 */
export interface LegalDoc {
  title: string;
  updated: string;
  sections: { h: string; p: string[] }[];
}

const OWNER = "[PLATFORM SAHİBİNİN ADI / ŞİRKET UNVANI]";
const CONTACT = "[İLETİŞİM E-POSTASI]";
const ADDRESS = "[YAZIŞMA ADRESİ]";

export const LEGAL: Record<string, LegalDoc> = {
  gizlilik: {
    title: "Gizlilik Politikası",
    updated: "9 Kasım 2026",
    sections: [
      { h: "Biz kimiz?", p: [`AMEDSPOR Taraftar Platformu, ${OWNER} tarafından işletilen bağımsız bir taraftar platformudur. Amed Sportif Faaliyetler Kulübü ile resmî bir bağlantısı yoktur. İletişim: ${CONTACT}.`] },
      { h: "Hangi verileri topluyoruz?", p: [
        "Hesap verileri: e-posta adresi, kullanıcı adı, görünen ad, biyografi, profil fotoğrafı, şifrenizin geri döndürülemez özeti (şifreniz düz metin olarak saklanmaz).",
        "İçerik verileri: gönderiler, fotoğraflar, videolar, yorumlar, beğeniler, kaydedilenler, anket oyları, tahminler, şikâyetler.",
        "Abonelik verileri: abonelik durumu, ödeme tarihi ve tutarı. Kart bilgileriniz bizim sistemlerimizde SAKLANMAZ; ödeme kuruluşu tarafından işlenir.",
        "Teknik veriler: oturum çerezleri, IP adresi (güvenlik ve kötüye kullanımı önleme amacıyla, hız sınırlama kayıtlarında kısa süreli).",
      ] },
      { h: "Verileri neden işliyoruz?", p: ["Hesabınızı oluşturmak ve yönetmek; içerik paylaşımını sağlamak; topluluk güvenliği ve moderasyon; Premium aboneliği yürütmek; yasal yükümlülükleri yerine getirmek; izniniz varsa reklam göstermek."] },
      { h: "Kimlerle paylaşıyoruz?", p: [
        "Altyapı sağlayıcıları: Supabase (veritabanı, kimlik doğrulama, dosya depolama), Vercel (barındırma). Bu sağlayıcıların sunucuları yurt dışında olabilir; bu durumda KVKK m.9 kapsamındaki yurt dışı aktarım şartlarına uyulur.",
        "Ödeme kuruluşu (abonelik alırsanız) ve izin verirseniz reklam ortakları (ör. Google AdSense).",
        "Yasal zorunluluk halinde yetkili kamu kurumları.",
      ] },
      { h: "Saklama süresi", p: ["Hesabınızı sildiğinizde profil ve içerikleriniz kalıcı olarak silinir. Mali mevzuat gereği ödeme kayıtları kişisel bağlantısı kaldırılarak yasal süre boyunca saklanabilir."] },
      { h: "Haklarınız", p: ["KVKK m.11 kapsamındaki haklarınızı (bilgi talebi, düzeltme, silme, itiraz vb.) Ayarlar > Hesap ve veriler bölümünden (verilerimi indir, hesabımı sil) veya iletişim adresimizden kullanabilirsiniz."] },
      { h: "Çocukların gizliliği", p: ["Platform 13 yaşından küçükler için değildir. 18 yaşından küçük kullanıcıların veli onayıyla kullanması beklenir. Çocuklara kişiselleştirilmiş reklam gösterilmemesi için reklam izinleri varsayılan olarak kapalıdır."] },
    ],
  },
  kvkk: {
    title: "KVKK Aydınlatma Metni",
    updated: "9 Kasım 2026",
    sections: [
      { h: "Veri sorumlusu", p: [`6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu ${OWNER}'dır. Adres: ${ADDRESS}. E-posta: ${CONTACT}.`] },
      { h: "İşlenen kişisel veriler ve amaçlar", p: [
        "Kimlik ve iletişim (kullanıcı adı, e-posta): üyelik sözleşmesinin kurulması ve ifası (KVKK m.5/2-c).",
        "Kullanıcı içerikleri: hizmetin sunulması (m.5/2-c), topluluk güvenliği için meşru menfaat (m.5/2-f).",
        "İşlem güvenliği (IP, oturum kayıtları): hukuki yükümlülük ve meşru menfaat (m.5/2-ç, f).",
        "Pazarlama / kişiselleştirilmiş reklam: yalnızca açık rızanız ile (m.5/1).",
      ] },
      { h: "Aktarım", p: ["Kişisel verileriniz hizmetin gerektirdiği ölçüde altyapı, ödeme ve (rızanız varsa) reklam hizmet sağlayıcılarına aktarılabilir. Yurt dışına aktarımda KVKK m.9 hükümlerine uyulur."] },
      { h: "Haklarınız (KVKK m.11)", p: ["Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, düzeltilmesini, silinmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı iletişim adresimize iletebilirsiniz; en geç 30 gün içinde yanıtlanır."] },
    ],
  },
  "kullanim-sartlari": {
    title: "Kullanım Şartları",
    updated: "9 Kasım 2026",
    sections: [
      { h: "Hizmetin niteliği", p: ["AMEDSPOR, taraftarların haber okuyabildiği, içerik paylaşabildiği ve eğlence amaçlı tahmin oyunlarına katılabildiği bağımsız bir platformdur. Kulübün resmî uygulaması değildir."] },
      { h: "Üyelik", p: ["Kayıt için en az 13 yaşında olmanız gerekir. Hesabınızın güvenliğinden siz sorumlusunuz. Gerçeğe aykırı bilgiyle veya başkası adına hesap açmak yasaktır."] },
      { h: "Kullanıcı içerikleri", p: ["Paylaştığınız içeriklerden siz sorumlusunuz. İçeriğiniz üzerindeki haklarınız sizde kalır; platformda gösterilmesi için bize sınırlı, münhasır olmayan bir kullanım izni vermiş olursunuz. Başkasına ait fotoğraf, video, maç görüntüsü ve logoları izinsiz paylaşmayın."] },
      { h: "Yasak davranışlar", p: ["Küfür, hakaret, tehdit, ırkçılık, nefret söylemi, taciz, şiddet çağrısı, spam, dolandırıcılık, kişisel bilgi ifşası ve uygunsuz görsel içerik yasaktır. Ayrıntılar Topluluk Kuralları'ndadır. İhlal halinde içerik kaldırılabilir, hesap askıya alınabilir veya kapatılabilir."] },
      { h: "Tahmin oyunları", p: ["Tahmin ve bilgi yarışmaları yalnızca eğlence amaçlıdır. Para yatırma, para çekme, bahis veya nakit ödül yoktur. Puanların parasal değeri yoktur."] },
      { h: "Sorumluluğun sınırlandırılması", p: ["Haber ve maç verileri belirtilen kaynaklardan derlenir; hatasız olduğu garanti edilmez. Kesin bilgi için resmî kaynaklara başvurun."] },
    ],
  },
  cerezler: {
    title: "Çerez Politikası",
    updated: "9 Kasım 2026",
    sections: [
      { h: "Zorunlu çerezler", p: ["Oturumunuzu açık tutmak (Supabase kimlik çerezleri), güvenlik ve tercihlerinizi (tema, çerez izni) hatırlamak için kullanılır. Bu çerezler olmadan platform çalışmaz."] },
      { h: "Reklam çerezleri (isteğe bağlı)", p: [
        "Yalnızca izin verirseniz Google AdSense gibi reklam ortaklarının çerezleri yüklenir.",
        "'Yalnızca zorunlu' seçeneğinde üçüncü taraf reklam kodu hiç yüklenmez; yalnızca platformun kendi sponsor kartları (çerezsiz) görünebilir.",
        "'Kişiselleştirilmemiş reklam' seçeneğinde reklamlar sayfa içeriğine göre gösterilir.",
        "Premium üyelerde hiçbir reklam ve reklam çerezi yüklenmez.",
      ] },
      { h: "Tercihinizi değiştirme", p: ["Ayarlar > Gizlilik ve tercihler bölümünden çerez tercihinizi istediğiniz zaman değiştirebilirsiniz."] },
    ],
  },
  abonelik: {
    title: "Premium Abonelik ve İptal Koşulları",
    updated: "9 Kasım 2026",
    sections: [
      { h: "Kapsam", p: ["AMEDSPOR Premium, platformdaki tüm reklamları kaldıran aylık bir aboneliktir. Ücretsiz üyelerin temel özelliklerden hiçbiri Premium'a taşınmamıştır; Premium yalnızca reklamsız deneyim sağlar."] },
      { h: "Ücret ve yenileme", p: ["Güncel aylık ücret Premium sayfasında KDV dahil olarak gösterilir. Abonelik, iptal edilmediği sürece her ay aynı gün otomatik olarak yenilenir. Fiyat değişikliği yapılırsa mevcut aboneler önceden bilgilendirilir ve değişiklik bir sonraki dönemden itibaren uygulanır."] },
      { h: "İptal", p: ["Aboneliğinizi Premium sayfasındaki 'Aboneliği iptal et' düğmesiyle istediğiniz an, tek adımda iptal edebilirsiniz. İptal sonrası yeni ücret alınmaz; ödediğiniz dönemin sonuna kadar Premium haklarınız devam eder, ardından hesabınız otomatik olarak ücretsiz üyeliğe döner."] },
      { h: "Cayma hakkı ve iade", p: ["Mesafeli Sözleşmeler Yönetmeliği kapsamında dijital içerik/hizmetlerde cayma hakkının istisnaları bulunabilir. İade talepleri [İADE POLİTİKASI — UZMAN TARAFINDAN BELİRLENMELİ] çerçevesinde değerlendirilir. İade edilen ödemede Premium hakkı derhal sona erer."] },
      { h: "Ödeme güvenliği", p: ["Ödemeler lisanslı ödeme kuruluşunun güvenli sayfasında alınır. Kart bilgileriniz AMEDSPOR sistemlerinde saklanmaz."] },
    ],
  },
  "topluluk-kurallari": {
    title: "Topluluk Kuralları",
    updated: "9 Kasım 2026",
    sections: [
      { h: "Saygılı iletişim", p: ["Rakip taraftarlar dahil herkese saygı gösterin. Küfür, hakaret ve aşağılayıcı ifadeler yayınlanmaz."] },
      { h: "Kesinlikle yasak", p: ["Tehdit ve şiddet çağrısı; ırk, etnik köken, din, cinsiyet, cinsel yönelim veya engelliliğe dayalı nefret söylemi; taciz ve ısrarlı rahatsız etme; başkalarının telefon, adres, kimlik gibi kişisel bilgilerini paylaşma; dolandırıcılık, bahis/bonus reklamı ve spam; müstehcen veya şiddet içeren görseller."] },
      { h: "Denetim nasıl çalışır?", p: ["Paylaşımlar otomatik bir Türkçe filtreden geçer; şüpheli içerikler insan incelemesine alınır. Otomatik denetim kusursuz değildir: yanlış bir karar verildiğini düşünürseniz bildirimdeki bağlantıdan itiraz edebilirsiniz."] },
      { h: "Şikâyet", p: ["Kurallara aykırı bir içerik gördüğünüzde içeriğin menüsündeki 'Şikâyet et' seçeneğini kullanın. Şikâyetler moderatörler tarafından incelenir ve şikâyet eden kişinin kimliği içerik sahibiyle paylaşılmaz."] },
    ],
  },
  telif: {
    title: "Telif Hakkı Başvurusu",
    updated: "9 Kasım 2026",
    sections: [
      { h: "Haber içerikleri", p: ["Haber merkezinde yalnızca başlık, kısa özet ve kaynağa bağlantı yayınlanır; kaynağın tam metni izinsiz kopyalanmaz. Görseller yalnızca izinli kaynaklardan ve telif bilgisiyle kullanılır."] },
      { h: "Başvuru", p: [`Telif hakkınızı ihlal ettiğini düşündüğünüz bir içerik için ${CONTACT} adresine; hak sahibi olduğunuzu gösteren bilgi, ihlal eden içeriğin bağlantısı ve iletişim bilgilerinizle başvurabilirsiniz. Ayrıca içerikteki 'Şikâyet et > Telif hakkı ihlali' seçeneğini kullanabilirsiniz. Başvurular en kısa sürede incelenir ve haklı bulunan içerik kaldırılır.`] },
    ],
  },
};
