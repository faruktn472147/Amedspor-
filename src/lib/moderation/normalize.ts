/**
 * Türkçe metin normalizasyonu — moderasyon filtresinin atlatılmasını zorlaştırır.
 *
 * Ele alınan atlatma yöntemleri:
 *  - Büyük/küçük harf ve Türkçe İ/ı dönüşümü
 *  - Rakam/sembol ile harf değiştirme (s1kt1r, @, $, 0, 3 ...)
 *  - Harf tekrarı (siiiiktir)
 *  - Harfleri boşluk veya noktalama ile bölme (s i k t i r, s.i.k)
 *  - Görünmez karakterler ve aksan işaretleri
 */

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "!": "i",
  "|": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  $: "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "€": "e",
};

const FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

const INVISIBLE = /[​-‏⁠﻿­]/g;

/** Türkçe küçük harfe çevirir, görünmez karakterleri temizler. */
export function lowerTr(input: string): string {
  return input.normalize("NFC").replace(INVISIBLE, "").toLocaleLowerCase("tr-TR");
}

function mapLeet(s: string): string {
  let out = "";
  for (const ch of s) out += LEET[ch] ?? ch;
  return out;
}

export function foldTr(s: string): string {
  let out = "";
  for (const ch of s) out += FOLD[ch] ?? ch;
  // diğer aksanları kaldır
  return out.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function collapseRepeats(s: string): string {
  return s.replace(/(\p{L})\1+/gu, "$1");
}

/**
 * Tek harflerin boşluk/noktalama ile ayrıldığı dizileri birleştirir:
 * "s i k t i r" -> "siktir", "a.m.k" -> "amk"
 */
function joinSplitLetters(s: string): string {
  return s.replace(/(?:^|(?<=\s))((?:\p{L}[\s.\-_*+,]+){2,}\p{L})(?=\s|$)/gu, (m) =>
    m.replace(/[\s.\-_*+,]+/g, ""),
  );
}

export interface NormalizedText {
  /** Türkçe harfleri koruyan form (ı/i ayrımı korunur) */
  preserved: string;
  /** Türkçe harfleri ASCII'ye katlanmış form */
  folded: string;
  /** Kelimeler (preserved) */
  tokens: string[];
  /** Kelimeler (folded) */
  foldedTokens: string[];
  /** Boşluksuz katlanmış form — kelimeye bölünmüş gizlemeleri yakalar */
  compact: string;
}

export function normalizeText(input: string): NormalizedText {
  const lower = lowerTr(input);
  const leet = mapLeet(lower);
  const joined = joinSplitLetters(leet);
  const cleaned = joined.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const preserved = collapseRepeats(cleaned);
  const folded = collapseRepeats(foldTr(cleaned));
  return {
    preserved,
    folded,
    tokens: preserved ? preserved.split(" ") : [],
    foldedTokens: folded ? folded.split(" ") : [],
    compact: folded.replace(/\s+/g, ""),
  };
}
