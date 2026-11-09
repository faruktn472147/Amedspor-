import { foldTr, lowerTr } from "@/lib/moderation/normalize";
import type { FeedItem } from "./feed";

export type TrustLevel = "official" | "trusted" | "review";
export type Verification = "official" | "verified" | "unverified" | "rumor";
export type NewsCategory = "son_dakika" | "resmi" | "haber" | "transfer" | "mac" | "roportaj";

export interface SourceLike {
  kind: "official_club" | "official_social" | "federation" | "media" | "journalist" | "aggregator";
  trust_level: TrustLevel;
  auto_publish: boolean;
  keywords: string[];
}

const f = (s: string) => foldTr(lowerTr(s));

const RUMOR = ["iddia", "soylenti", "kulis", "gundeminde", "ilgileniyor", "masada", "yakin takip", "talip", "goruşuyor", "gorusuyor", "teklif yapti", "iddiasi"];
const TRANSFER = ["transfer", "imza", "kiralik", "bonservis", "sozlesme", "anlasti", "anlasma"];
const SENSITIVE = [
  ...RUMOR,
  "transfer",
  "olum",
  "vefat",
  "yarali",
  "saldiri",
  "gozalti",
  "tutuk",
  "sorusturma",
  "ceza",
  "pfdk",
  "disiplin",
  "istifa",
  "kavga",
  "olay cikti",
  "irkci",
  "hakem",
  "sike",
  "dava",
];
const MATCH = ["mac sonu", "ilk 11", "kadro", "gol", "skor", "deplasman", "galibiyet", "maglubiyet", "beraberlik"];
const INTERVIEW = ["roportaj", "konustu", "acikladi", "basin toplantisi"];

const has = (text: string, list: string[]) => list.some((w) => text.includes(w));

export function isRelevant(item: FeedItem, keywords: string[]): boolean {
  const t = f(`${item.title} ${item.summary}`);
  return keywords.some((k) => t.includes(f(k)));
}

/** Haber çok eskiyse otomatik olarak yeni haber gibi yayınlanmaz. */
export function isTooOld(item: FeedItem, now = new Date(), maxAgeDays = 7): boolean {
  if (!item.publishedAt) return true;
  return now.getTime() - item.publishedAt.getTime() > maxAgeDays * 86400000 || item.publishedAt.getTime() > now.getTime() + 3600000;
}

export interface Classification {
  category: NewsCategory;
  verification: Verification;
  isSensitive: boolean;
  status: "published" | "pending";
  reason: string;
}

export function classifyItem(item: FeedItem, source: SourceLike, now = new Date()): Classification {
  const t = f(`${item.title} ${item.summary}`);
  const rumor = has(t, RUMOR);
  const transfer = has(t, TRANSFER);
  const sensitive = has(t, SENSITIVE);

  const isOfficial = source.trust_level === "official" && (source.kind === "official_club" || source.kind === "official_social" || source.kind === "federation");
  let verification: Verification = isOfficial ? "official" : source.trust_level === "trusted" ? "verified" : "unverified";
  // Resmî olmayan kaynakta söylenti dili → "söylenti" olarak etiketlenir, kesin bilgi gibi gösterilmez
  if (rumor && !isOfficial) verification = "rumor";

  let category: NewsCategory = "haber";
  if (isOfficial) category = "resmi";
  if (transfer) category = "transfer";
  else if (has(t, MATCH)) category = "mac";
  else if (has(t, INTERVIEW)) category = "roportaj";

  let status: "published" | "pending" = "pending";
  let reason = "Yönetici onayı bekliyor";
  if (isTooOld(item, now)) reason = "Haber tarihi eski veya bilinmiyor; otomatik yayınlanmadı";
  else if (!source.auto_publish) reason = "Kaynak otomatik yayına kapalı";
  else if (source.trust_level === "review") reason = "Kaynak güven seviyesi incelemede";
  else if (sensitive && !isOfficial) reason = "Hassas konu; yönetici onayı gerekli";
  else if (verification === "rumor") reason = "Söylenti içeriyor";
  else {
    status = "published";
    reason = "Güvenilir kaynaktan otomatik yayın";
  }
  return { category, verification, isSensitive: sensitive, status, reason };
}

export const VERIFICATION_LABEL: Record<Verification, string> = {
  official: "Resmî kaynak",
  verified: "Güvenilir kaynak",
  unverified: "Doğrulanmadı",
  rumor: "Söylenti — kesin değil",
};
