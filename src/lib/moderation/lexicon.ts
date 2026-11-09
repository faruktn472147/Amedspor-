/**
 * Moderasyon sözlüğü. Tüm terimler katlanmış (ASCII) ve harf tekrarı
 * kaldırılmış biçimde yazılır (normalize.ts ile aynı dönüşüm).
 *
 * Eşleşme türleri:
 *  - exact  : kelimenin tamamı eşleşmeli ("aq", "amk")
 *  - prefix : kelime bu kökle başlamalı ("siktir", "sikerim")
 *  - phrase : katlanmış metin içinde kelime dizisi geçmeli
 *
 * Yanlış engellemeleri azaltmak için SAFE_WORDS listesi kökle başlayan masum
 * kelimeleri hariç tutar. Liste genişletilebilir; yönetici incelemesi her zaman
 * son karardır.
 */

export type Category =
  | "kufur"
  | "hakaret"
  | "tehdit"
  | "nefret"
  | "taciz"
  | "siddet"
  | "spam"
  | "dolandiricilik"
  | "kisisel_bilgi";

export type Severity = "block" | "review";

export interface Term {
  term: string;
  match: "exact" | "prefix" | "phrase";
  category: Category;
  severity: Severity;
  /**
   * true ise, kelime Türkçe noktasız "ı" ile yazıldığında masumdur
   * (ör. "sık", "sıkıntı"). Bu durumda eşleşme yok sayılır.
   */
  dotlessSafe?: boolean;
}

const t = (
  term: string,
  match: Term["match"],
  category: Category,
  severity: Severity,
  dotlessSafe = false,
): Term => ({ term, match, category, severity, dotlessSafe });

export const TERMS: Term[] = [
  // Ağır küfür → engelle
  t("amk", "exact", "kufur", "block"),
  t("aq", "exact", "kufur", "block"),
  t("amq", "exact", "kufur", "block"),
  t("mk", "exact", "kufur", "review"),
  t("amina", "prefix", "kufur", "block"),
  t("aminako", "prefix", "kufur", "block"),
  t("amcik", "prefix", "kufur", "block"),
  t("sik", "prefix", "kufur", "block", true),
  t("sok", "exact", "kufur", "review"),
  t("yarak", "prefix", "kufur", "block"),
  t("yarag", "prefix", "kufur", "block"),
  t("orospu", "prefix", "kufur", "block"),
  t("orspu", "prefix", "kufur", "block"),
  t("oc", "exact", "kufur", "review"),
  t("pic", "exact", "kufur", "block"),
  t("piclik", "prefix", "kufur", "block"),
  t("got", "exact", "kufur", "review"),
  t("gotveren", "prefix", "kufur", "block"),
  t("gotune", "prefix", "kufur", "block"),
  t("kahpe", "prefix", "kufur", "block"),
  t("pezevenk", "prefix", "kufur", "block"),
  t("gavat", "prefix", "kufur", "block"),
  t("yavsak", "prefix", "kufur", "block"),
  t("pust", "exact", "kufur", "block"),
  t("kaltak", "prefix", "kufur", "block"),
  t("surtuk", "prefix", "kufur", "block"),
  t("ibne", "prefix", "nefret", "block"),
  t("anani", "prefix", "kufur", "block"),
  t("ananin", "prefix", "kufur", "review"),
  t("bacini", "prefix", "kufur", "block"),
  t("ana avrat", "phrase", "kufur", "block"),

  // Hakaret → incelemeye al (bağlama göre değişebilir)
  t("serefsiz", "prefix", "hakaret", "review"),
  t("namussuz", "prefix", "hakaret", "review"),
  t("gerizekali", "prefix", "hakaret", "review"),
  t("salak", "prefix", "hakaret", "review"),
  t("aptal", "prefix", "hakaret", "review"),
  t("dangalak", "prefix", "hakaret", "review"),
  t("dalyarak", "prefix", "kufur", "block"),
  t("dalama", "prefix", "hakaret", "review"),
  t("dallama", "prefix", "hakaret", "review"),
  t("mal", "exact", "hakaret", "review"),
  t("haysiyetsiz", "prefix", "hakaret", "review"),
  t("adi herif", "phrase", "hakaret", "review"),

  // Tehdit → engelle
  t("oldurecegim", "prefix", "tehdit", "block"),
  t("oldururum", "prefix", "tehdit", "block"),
  t("seni oldur", "phrase", "tehdit", "block"),
  t("gebertirim", "prefix", "tehdit", "block"),
  t("geberteceg", "prefix", "tehdit", "block"),
  t("kafani keserim", "phrase", "tehdit", "block"),
  t("kafani kopar", "phrase", "tehdit", "block"),
  t("evini yakar", "phrase", "tehdit", "block"),
  t("vururum seni", "phrase", "tehdit", "block"),
  t("seni vurur", "phrase", "tehdit", "block"),
  t("bicaklarim", "prefix", "tehdit", "block"),
  t("adresini biliyorum", "phrase", "tehdit", "block"),
  t("seni bulacagim", "phrase", "tehdit", "review"),

  // Şiddet çağrısı → engelle
  t("linc edin", "phrase", "siddet", "block"),
  t("lincleyin", "prefix", "siddet", "block"),
  t("saldirin", "exact", "siddet", "review"),
  t("dovun onlari", "phrase", "siddet", "block"),
  t("yakin onlari", "phrase", "siddet", "block"),
  t("hepsini oldurun", "phrase", "siddet", "block"),

  // Taciz → engelle/incele
  t("ciplak foto", "phrase", "taciz", "block"),
  t("nude at", "phrase", "taciz", "block"),
  t("seninle yatmak", "phrase", "taciz", "block"),

  // Dolandırıcılık → incele
  t("iban", "exact", "dolandiricilik", "review"),
  t("havale yap", "phrase", "dolandiricilik", "review"),
  t("garantili kazanc", "phrase", "dolandiricilik", "block"),
  t("kazanc garantili", "phrase", "dolandiricilik", "block"),
  t("bahis sitesi", "phrase", "dolandiricilik", "block"),
  t("deneme bonusu", "phrase", "dolandiricilik", "block"),
  t("bedava bonus", "phrase", "dolandiricilik", "block"),
  t("kripto yatirim", "phrase", "dolandiricilik", "review"),
  t("sifreni gonder", "phrase", "dolandiricilik", "block"),
  t("hesap bilgilerini", "phrase", "dolandiricilik", "review"),
  t("tikla kazan", "phrase", "dolandiricilik", "block"),
];

/** Kökle başlayan ama masum olan yaygın kelimeler (katlanmış biçimde). */
export const SAFE_WORDS = new Set<string>([
  // "sik" kökü ile başlayan masum kelimeler (ı → i katlanması nedeniyle)
  "sikinti",
  "sikintili",
  "sikintisi",
  "sikintiya",
  "sikici",
  "sikica",
  "siki",
  "sikiyor",
  "sikildim",
  "sikilmak",
  "sikiliyor",
  "sikistir",
  "sikistirma",
  "sikisik",
  "sikisti",
  "sikca",
  "sikke",
  "siklet",
  "sikma",
  "sikmak",
  "sikiyonetim",
  "sikintilar",
  "sikinca",
  // "amina" / "anani" ile başlayan masum kelimeler
  "aminati",
  "ananiz",
  "ananizin",
  // diğer
  "malzeme",
  "malum",
  "salakca",
  "yaraka",
  "gotik",
  "oclar",
  "picasso",
]);

/** Bağlamdan bağımsız güvenle engellenebilen nefret ifadesi kalıpları. */
export const HATE_GROUPS = [
  "kurt",
  "turk",
  "ermeni",
  "arap",
  "suriyeli",
  "afgan",
  "cingene",
  "roman",
  "yahudi",
  "alevi",
  "sunni",
  "laz",
  "zenci",
  "kurd",
  "gocmen",
];

export const HATE_INSULTS = ["kopek", "kopegi", "it", "pislik", "pis", "domuz", "hain", "bok", "mikrop", "soysuz", "leş", "les"];
