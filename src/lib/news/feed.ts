import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  title: string;
  link: string;
  publishedAt: Date | null;
  summary: string;
  imageUrl: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: true,
  htmlEntities: true,
  // XXE ve dış varlık saldırılarına karşı: DOCTYPE varlıkları işlenmez
  allowBooleanAttributes: true,
});

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Telif hakkına saygı: yalnızca kısa bir özet tutulur, tam metin kopyalanmaz. */
export function excerpt(text: string, max = 280): string {
  const clean = stripHtml(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"]);
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function safeUrl(u: string): string | null {
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** RSS 2.0 ve Atom beslemelerini ayrıştırır. */
export function parseFeed(xml: string): FeedItem[] {
  if (/<!ENTITY/i.test(xml)) throw new Error("Beslemede güvenli olmayan DTD varlığı var");
  const doc = parser.parse(xml) as Record<string, unknown>;
  const items: FeedItem[] = [];

  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  for (const raw of asArray(channel?.item as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const link = safeUrl(text(raw.link) || text(raw.guid));
    if (!link) continue;
    const enclosure = raw.enclosure as Record<string, string> | undefined;
    const media = raw["media:content"] as Record<string, string> | undefined;
    items.push({
      title: stripHtml(text(raw.title)).slice(0, 300),
      link,
      publishedAt: parseDate(text(raw.pubDate) || text(raw["dc:date"])),
      summary: excerpt(text(raw.description)),
      imageUrl: safeUrl(enclosure?.["@_url"] ?? media?.["@_url"] ?? "") ?? null,
    });
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  for (const raw of asArray(feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const links = asArray(raw.link as Record<string, string> | Record<string, string>[] | undefined);
    const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
    const link = safeUrl(alt?.["@_href"] ?? "");
    if (!link) continue;
    items.push({
      title: stripHtml(text(raw.title)).slice(0, 300),
      link,
      publishedAt: parseDate(text(raw.published) || text(raw.updated)),
      summary: excerpt(text(raw.summary) || text(raw.content)),
      imageUrl: null,
    });
  }
  return items.filter((i) => i.title.length >= 5);
}

export function dedupeKey(link: string): string {
  const u = new URL(link);
  u.hash = "";
  for (const p of [...u.searchParams.keys()]) if (p.startsWith("utm_")) u.searchParams.delete(p);
  return createHash("sha256").update(u.toString().toLowerCase()).digest("hex").slice(0, 40);
}
