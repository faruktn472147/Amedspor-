/**
 * Kullanıcıyı sıkmayan reklam yerleşim kuralları.
 *  - Premium üyeye hiçbir koşulda reklam gösterilmez.
 *  - Akışın en başında reklam olmaz; belirli aralıklarla ve sayfa başına sınırlı sayıda gösterilir.
 *  - Aynı kampanya aynı kullanıcıya günde sınırlı kez gösterilir; ardışık tekrar engellenir.
 *  - Reklam yoksa boş alan bırakılmaz (çağıran taraf null döndürür).
 */

export type PlacementCode =
  | "home_feed"
  | "news_detail"
  | "shorts_feed"
  | "match_center"
  | "player_profile"
  | "community_feed";

export interface AdSettings {
  enabled: boolean;
  feed_first_after: number;
  feed_every: number;
  shorts_every: number;
  max_per_page: number;
  per_campaign_daily_cap: number;
}

export const DEFAULT_AD_SETTINGS: AdSettings = {
  enabled: true,
  feed_first_after: 5,
  feed_every: 10,
  shorts_every: 15,
  max_per_page: 2,
  per_campaign_daily_cap: 3,
};

/** Yönetici panelinden gelen değerleri güvenli aralıklara sıkıştırır. */
export function sanitizeAdSettings(input: Partial<AdSettings> | null | undefined): AdSettings {
  const s = { ...DEFAULT_AD_SETTINGS, ...(input ?? {}) };
  const clamp = (n: unknown, min: number, max: number, def: number) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  };
  return {
    enabled: Boolean(s.enabled),
    // Akışın ilk 3 öğesinden önce asla reklam yok
    feed_first_after: clamp(s.feed_first_after, 3, 50, DEFAULT_AD_SETTINGS.feed_first_after),
    // En sık 5 içerikte bir
    feed_every: clamp(s.feed_every, 5, 100, DEFAULT_AD_SETTINGS.feed_every),
    // Shorts'ta en sık 8 videoda bir
    shorts_every: clamp(s.shorts_every, 8, 200, DEFAULT_AD_SETTINGS.shorts_every),
    max_per_page: clamp(s.max_per_page, 0, 5, DEFAULT_AD_SETTINGS.max_per_page),
    per_campaign_daily_cap: clamp(s.per_campaign_daily_cap, 1, 20, DEFAULT_AD_SETTINGS.per_campaign_daily_cap),
  };
}

export interface AdContext {
  isPremium: boolean;
  settings: AdSettings;
  placementEnabled: boolean;
}

export function shouldShowAds(ctx: AdContext): boolean {
  return !ctx.isPremium && ctx.settings.enabled && ctx.placementEnabled && ctx.settings.max_per_page > 0;
}

/** Akışta hangi öğelerden SONRA reklam gösterileceğini döndürür (0 tabanlı indeks). */
export function adPositions(itemCount: number, firstAfter: number, every: number, maxPerPage: number): number[] {
  const out: number[] = [];
  if (itemCount <= 0 || maxPerPage <= 0) return out;
  for (let pos = firstAfter - 1; pos < itemCount - 1 && out.length < maxPerPage; pos += every) {
    out.push(pos);
  }
  return out;
}

export type FeedEntry<T> = { type: "item"; item: T; key: string } | { type: "ad"; slot: number; key: string };

export function interleaveAds<T>(
  items: T[],
  keyOf: (item: T) => string,
  positions: number[],
): FeedEntry<T>[] {
  const set = new Set(positions);
  const out: FeedEntry<T>[] = [];
  let slot = 0;
  items.forEach((item, i) => {
    out.push({ type: "item", item, key: keyOf(item) });
    if (set.has(i)) out.push({ type: "ad", slot: slot++, key: `ad-${i}` });
  });
  return out;
}

export interface CampaignLike {
  id: string;
  priority: number;
  placement_codes: string[];
}

/**
 * Gösterilecek kampanyayı seçer. Günlük sınırı dolan ve bir önceki gösterilenle aynı
 * olan kampanyalar atlanır. Uygun kampanya yoksa null döner (boş alan bırakılmaz).
 */
export function pickCampaign<C extends CampaignLike>(
  campaigns: C[],
  placement: PlacementCode,
  seenToday: Record<string, number>,
  dailyCap: number,
  lastShownId: string | null,
  slot = 0,
): C | null {
  const eligible = campaigns
    .filter((c) => c.placement_codes.includes(placement))
    .filter((c) => (seenToday[c.id] ?? 0) < dailyCap)
    .sort((a, b) => b.priority - a.priority || (seenToday[a.id] ?? 0) - (seenToday[b.id] ?? 0));
  if (eligible.length === 0) return null;
  const withoutLast = eligible.length > 1 ? eligible.filter((c) => c.id !== lastShownId) : eligible;
  return withoutLast[slot % withoutLast.length] ?? null;
}
