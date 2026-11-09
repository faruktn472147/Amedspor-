import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeKey, parseFeed } from "./feed";
import { classifyItem, isRelevant } from "./classify";
import type { NewsSource } from "@/lib/types";

const MAX_FEED_BYTES = 2 * 1024 * 1024;

async function fetchFeed(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("Yalnızca https beslemeleri desteklenir");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) throw new Error("İç ağ adresi engellendi");
  const res = await fetch(u, {
    headers: { "user-agent": "AmedsporTaraftarBot/1.0 (+bagimsiz taraftar platformu)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error("Besleme çok büyük");
  return text;
}

export interface IngestReport {
  sources: number;
  inserted: number;
  published: number;
  errors: { source: string; error: string }[];
}

/** Etkin kaynakların RSS/Atom beslemelerini tarar. Haber uydurmaz; yalnızca kaynağın yayınladığını başlık+özet+bağlantı olarak kaydeder. */
export async function ingestAllSources(db: SupabaseClient, now = new Date()): Promise<IngestReport> {
  const report: IngestReport = { sources: 0, inserted: 0, published: 0, errors: [] };
  const { data: sources } = await db.from("news_sources").select("*").eq("is_active", true).not("feed_url", "is", null);
  for (const src of (sources ?? []) as NewsSource[]) {
    report.sources += 1;
    try {
      const items = parseFeed(await fetchFeed(src.feed_url!)).filter((i) => isRelevant(i, src.keywords));
      for (const item of items.slice(0, 30)) {
        const c = classifyItem(item, src, now);
        const { error } = await db.from("news").insert({
          source_id: src.id,
          title: item.title,
          summary: item.summary,
          body: "",
          original_url: item.link,
          image_url: src.republish_allowed ? item.imageUrl : null,
          category: c.category,
          verification: c.verification,
          is_sensitive: c.isSensitive,
          status: c.status,
          published_at: c.status === "published" ? now.toISOString() : null,
          source_published_at: item.publishedAt?.toISOString() ?? null,
          dedupe_key: dedupeKey(item.link),
        });
        if (!error) {
          report.inserted += 1;
          if (c.status === "published") report.published += 1;
        }
      }
      await db.from("news_sources").update({ last_fetched_at: now.toISOString(), last_error: null }).eq("id", src.id);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      report.errors.push({ source: src.name, error: msg });
      await db.from("news_sources").update({ last_fetched_at: now.toISOString(), last_error: msg }).eq("id", src.id);
    }
  }
  return report;
}
