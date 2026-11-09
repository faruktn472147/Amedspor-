import { HATE_GROUPS, HATE_INSULTS, SAFE_WORDS, TERMS, type Category, type Severity } from "./lexicon";
import { normalizeText } from "./normalize";

export type ModerationDecision = "allow" | "review" | "block";

export interface ModerationHit {
  category: Category;
  severity: Severity;
  term: string;
}

export interface ModerationResult {
  decision: ModerationDecision;
  hits: ModerationHit[];
  /** Kullanıcıya gösterilecek Türkçe açıklama */
  message: string | null;
}

export type ContentField = "post" | "comment" | "username" | "bio" | "display_name";

const CATEGORY_LABEL: Record<Category, string> = {
  kufur: "küfür",
  hakaret: "hakaret",
  tehdit: "tehdit",
  nefret: "nefret söylemi / ırkçılık",
  taciz: "taciz",
  siddet: "şiddet çağrısı",
  spam: "spam",
  dolandiricilik: "dolandırıcılık şüphesi",
  kisisel_bilgi: "kişisel bilgi paylaşımı",
};

// Kişisel bilgi kalıpları (ham metin üzerinde çalışır)
const PHONE_RE = /(?:\+?90[\s.-]?)?\(?0?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/;
const TC_RE = /(?<!\d)[1-9]\d{10}(?!\d)/;
const IBAN_RE = /\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const CARD_RE = /(?<!\d)(?:\d[ -]?){15,16}(?!\d)/;
const URL_RE = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi;

/** TC kimlik numarası algoritma kontrolü — rastgele 11 haneli sayıları ayırır. */
export function isValidTcKimlik(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[9] === d10 && d[10] === d11;
}

function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return digits.length >= 15 && sum % 10 === 0;
}

function detectPersonalInfo(raw: string, hits: ModerationHit[]) {
  if (PHONE_RE.test(raw)) hits.push({ category: "kisisel_bilgi", severity: "block", term: "telefon" });
  const tc = raw.match(TC_RE);
  if (tc && isValidTcKimlik(tc[0])) hits.push({ category: "kisisel_bilgi", severity: "block", term: "tc_kimlik" });
  if (IBAN_RE.test(raw)) hits.push({ category: "dolandiricilik", severity: "review", term: "iban" });
  const card = raw.match(CARD_RE);
  if (card && luhn(card[0])) hits.push({ category: "kisisel_bilgi", severity: "block", term: "kart" });
  if (EMAIL_RE.test(raw)) hits.push({ category: "kisisel_bilgi", severity: "review", term: "eposta" });
}

function detectSpam(raw: string, hits: ModerationHit[]) {
  const urls = raw.match(URL_RE) ?? [];
  if (urls.length >= 3) hits.push({ category: "spam", severity: "review", term: "cok_link" });
  if (/(.)\1{14,}/u.test(raw)) hits.push({ category: "spam", severity: "review", term: "tekrar" });
  const words = raw.toLocaleLowerCase("tr-TR").split(/\s+/).filter((w) => w.length > 2);
  if (words.length >= 12) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.3) hits.push({ category: "spam", severity: "review", term: "tekrar_kelime" });
  }
}

function matchTerms(
  tokens: string[],
  preservedTokens: string[],
  folded: string,
  compact: string,
  hits: ModerationHit[],
  field: ContentField,
) {
  const padded = ` ${folded} `;
  for (const term of TERMS) {
    let found = false;
    let severity = term.severity;
    if (term.match === "exact") {
      found = tokens.includes(term.term);
    } else if (term.match === "prefix") {
      const dotless = term.term.replace(/i/g, "ı");
      found = tokens.some((tok, i) => {
        if (!tok.startsWith(term.term) || SAFE_WORDS.has(tok)) return false;
        const original = preservedTokens[i] ?? tok;
        if (term.dotlessSafe && original.startsWith(dotless)) return false;
        // Tek başına ASCII yazım belirsizdir ("sik" = "sık" olabilir) → incelemeye al
        if (term.dotlessSafe && tok === term.term) severity = "review";
        return true;
      });
      // Kullanıcı adlarında kelime ayrımı yoktur: "kral_amk_34" gibi
      if (!found && (field === "username" || field === "display_name") && term.term.length >= 4) {
        found = compact.includes(term.term);
      }
    } else {
      found = padded.includes(` ${term.term} `) || padded.includes(` ${term.term}`);
    }
    if (found) hits.push({ category: term.category, severity, term: term.term });
  }
}

function matchHate(tokens: string[], hits: ModerationHit[]) {
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isGroup = HATE_GROUPS.some((g) => tok === g || (tok.startsWith(g) && tok.length - g.length <= 4));
    if (!isGroup) continue;
    const window = tokens.slice(Math.max(0, i - 2), i + 3);
    if (window.some((w) => HATE_INSULTS.includes(w))) {
      hits.push({ category: "nefret", severity: "block", term: `${tok}+hakaret` });
    }
  }
}

/**
 * Metin içeriğini Türkçe kurallarla denetler.
 * Not: Otomatik denetim kusursuz değildir. "review" kararı içeriği insan
 * incelemesine gönderir; kullanıcılar ayrıca şikâyet ve itiraz edebilir.
 */
export function moderateText(raw: string, field: ContentField = "post"): ModerationResult {
  const hits: ModerationHit[] = [];
  const text = raw ?? "";
  if (!text.trim()) return { decision: "allow", hits, message: null };

  const n = normalizeText(text);
  matchTerms(n.foldedTokens, n.tokens, n.folded, n.compact, hits, field);
  matchHate(n.foldedTokens, hits);
  detectPersonalInfo(text, hits);
  if (field === "post" || field === "comment") detectSpam(text, hits);

  // Kullanıcı adı ve biyografide şüpheli içerik de engellenir (incelemeye alınamaz).
  const strictField = field === "username" || field === "display_name";
  let decision: ModerationDecision = "allow";
  if (hits.some((h) => h.severity === "block") || (strictField && hits.length > 0)) decision = "block";
  else if (hits.length > 0) decision = "review";

  let message: string | null = null;
  if (decision !== "allow") {
    const labels = [...new Set(hits.map((h) => CATEGORY_LABEL[h.category]))].join(", ");
    message =
      decision === "block"
        ? `İçeriğin topluluk kurallarımıza uymuyor (${labels}). Lütfen saygılı bir dil kullan.`
        : `İçeriğin yayınlanmadan önce incelemeye alındı (${labels}).`;
  }
  return { decision, hits, message };
}

/** Birden fazla alanı birlikte denetler, en ağır kararı döndürür. */
export function moderateFields(fields: Partial<Record<ContentField, string>>): ModerationResult {
  const results = (Object.entries(fields) as [ContentField, string | undefined][])
    .filter(([, v]) => v)
    .map(([k, v]) => moderateText(v as string, k));
  const order: ModerationDecision[] = ["allow", "review", "block"];
  const worst = results.reduce<ModerationResult>(
    (acc, r) => (order.indexOf(r.decision) > order.indexOf(acc.decision) ? r : acc),
    { decision: "allow", hits: [], message: null },
  );
  return { ...worst, hits: results.flatMap((r) => r.hits) };
}

export const MODERATION_STATUS: Record<ModerationDecision, "approved" | "pending" | "rejected"> = {
  allow: "approved",
  review: "pending",
  block: "rejected",
};
